import React, {Component} from "react";
import moment from "moment";
import _ from "lodash";
import PropTypes from "prop-types";
import {bisector} from "d3-array";

import {
    AnimationStatusContext,
    AnimationControlContext,
    AnimationDataContext,
} from "./AnimationCommon";
import {SigSetInterpolator} from "../lib/animation-helpers";
import {withAsyncErrorHandler} from "../lib/error-handling";
import {DataAccessSession} from "./DataAccess";
import {withComponentMixins} from "../lib/decorator-helpers";
import {intervalAccessMixin, TimeContext} from "./TimeContext";
import {IntervalSpec} from "./TimeInterval";


//When the tab is inactive, requests for animation frames are slowed down to 1
//or 2 per second. This means that we want to store at least 1s of keyframes
//ahead of the current position.
const inactiveTabTimePillow = 1000;

const defaultMaxTimeFetched = 30000;
const defaultMaxKeyframesStored = 1000;
const defaultPlaybackSpeedAggFactor = 5;

class RecordedAnimation extends Component {
    static propTypes = {
        dataSources: PropTypes.object.isRequired,

        initialIntervalSpec: PropTypes.object,
        getMinAggregationInterval: PropTypes.func,

        initialStatus: PropTypes.object,
        children: PropTypes.node,
    }

    static defaultProps = {
        initialIntervalSpec: new IntervalSpec('now-7d', 'now', null, null),
        initialStatus: {},
    }

    render() {
        const childrenRender = (props) => {
            return (
                <Animation
                    initialStatus={this.props.initialStatus}
                    {...props}
                >
                    {this.props.children}
                </Animation>
            );
        };

        return (
            <TimeContext
                initialIntervalSpec={this.props.initialIntervalSpec}
                getMinAggregationInterval={this.props.getMinAggregationInterval}
            >

                <AnimationDataAccess
                    dataSources={this.props.dataSources}
                    render={childrenRender}
                />
            </TimeContext>
        );
    }
}

class GenericDataSource {
    constructor(config, dataAccess) {
        this.dataAccess = dataAccess;

        this.conf = {
            intpArity: config.interpolation.arity,
            history: config.history || null,
            playbackSpeedAggFactor: config.playbackSpeedAggFactor || defaultPlaybackSpeedAggFactor,

            maxTimeStored: config.maxTimeStored || defaultMaxTimeFetched,
            maxKeyframesStored: config.maxKeyframesStored || defaultMaxKeyframesStored,

            getAggStep: config.useGlobalAggInterval ?
                () => this.dataAccess.getIntervalAbsolute().aggregationInterval :
                () => this.dataAccess.getPlaybackSpeedFactorBasedAggStep(this.conf.playbackSpeedAggFactor),
            getAggOffset: step =>
                moment.duration(this.dataAccess.getIntervalAbsolute().from.valueOf() % step.asMilliseconds()),

        };

        const signalAggs = config.signalAggs && config.signalAggs.length > 0 ?
            config.signalAggs :
            ['avg']
        ;

        this.sigSets = {};
        for (const sigSetConf of config.sigSets) {
            const signals = {};

            for (const sigConf of sigSetConf.signals) {
                signals[sigConf.cid] = signalAggs;
            }

            this.sigSets[sigSetConf.cid] = {
                cid: sigSetConf.cid,
                tsSigCid: sigSetConf.tsSigCid,
                signals,
                intp: new SigSetInterpolator(
                    sigSetConf.signals.map(s => s.cid),
                    signalAggs,
                    config.interpolation
                ),
            };
        }

        this._reset();
    }

    getEmptyData() {
        const data = {};
        for (const sigSet of Object.values(this.sigSets)) {
            data[sigSet.cid] = this.conf.history ? [] : sigSet.intp.interpolate(-1);
        }

        return data;
    }
    canShiftTo(ts) {
        return Object.values(this.sigSets).every(sigSet =>
            !sigSet.hasMoreData ||
            (
                sigSet.buffer.length >= this.conf.intpArity &&
                sigSet.buffer[sigSet.buffer.length - 1].ts >= ts
            )
        );
    }
    didMissFetch() {
        this.timePillowFactor *= 2;
    }

    shiftTo(ts) {
        if (this.conf.history) {
            const historyFirstTs = ts - this.conf.history;

            for (const sigSet of Object.values(this.sigSets)) {
                const historyLastTs = sigSet.history.length > 0 ?
                    sigSet.history[sigSet.history.length - 1].ts : -1;

                let i = sigSet.buffer.findIndex(kf => kf.ts > historyLastTs);
                while (i >= 0 && i < sigSet.buffer.length && sigSet.buffer[i].ts < ts) {
                    sigSet.history.push(sigSet.buffer[i]);
                    i++;
                }

                const historyFirstIdx = bisector(kf => kf.ts).left(sigSet.history, historyFirstTs);
                if (historyFirstIdx > 0) sigSet.history.splice(0, historyFirstIdx);
            }
        }

        const arity = this.conf.intpArity;
        const data = {};
        for (const sigSet of Object.values(this.sigSets)) {
            const needsShift = () => sigSet.buffer[arity - 1].ts < ts;

            if (sigSet.buffer.length < arity ||
                sigSet.buffer[sigSet.buffer.length - 1].ts < ts) {

                sigSet.buffer = [];
                sigSet.intp.clearArgs();

                if (sigSet.intp.hasCachedArgs) {
                    sigSet.intp.rebuildArgs(sigSet.buffer);
                }
            } else if (needsShift()) {
                while(needsShift()) {
                    const kfsToDelete = Math.min(
                        sigSet.buffer.length - arity,
                        arity - 1
                    );

                    sigSet.buffer.splice(0, kfsToDelete);
                }

                sigSet.intp.rebuildArgs(sigSet.buffer);
            } else if (!sigSet.intp.hasCachedArgs) {
                sigSet.intp.rebuildArgs(sigSet.buffer);
            }

            data[sigSet.cid] = this.conf.history ?
                [...sigSet.history, {ts, data: sigSet.intp.interpolate(ts)}] :
                sigSet.intp.interpolate(ts)
            ;
        }

        return data;
    }

    getSeekQueries(ts) {
        const queries = [];
        for (const sigSet of Object.values(this.sigSets)) {
            if (this.conf.history) {
                queries.push(this._getHistoryQuery(sigSet, ts));
            }

            queries.push(this._getFirstKeyframeQuery(sigSet, ts));

            const bucketCount = 3 * this.conf.intpArity;
            queries.push(this._getNextChunkQuery(sigSet, ts, bucketCount));
        }

        return queries;
    }
    processSeekQueries(qryResults, queries) {
        this._reset();

        const qrysPerSigSet = this.conf.history ? 3 : 2;
        for (const sigSet of Object.values(this.sigSets)) {
            const sigSetQrys = queries.splice(0, qrysPerSigSet);
            const sigSetQryResults = qryResults.splice(0, qrysPerSigSet);

            if (this.conf.history) {
                const historyQryBuckets = sigSetQryResults.shift()[0].buckets;
                sigSet.history.push(
                    ...historyQryBuckets.map(this._bucketToKeyframe)
                );
            }

            const firstKeyframeQryBuckets = sigSetQryResults.shift()[0].buckets;
            if (firstKeyframeQryBuckets.length > 0) {
                const firstBucket = firstKeyframeQryBuckets[0];
                sigSet.buffer.push(this._bucketToKeyframe(firstBucket));
            }

            const nextChunkQryBuckets = sigSetQryResults.shift()[0].buckets;

            this._processNextChunkBuckets(
                sigSet,
                nextChunkQryBuckets,
                sigSetQrys[qrysPerSigSet - 1]
            );
        }
    }

    getNextChunkQueries(maxPredictedFetchTime) {
        const queries = [];
        for (const sigSet of this._getSigSetsToFetch(maxPredictedFetchTime)) {
            const buffLen = sigSet.buffer.length;

            let timeStoredBucketLimit = Infinity;
            if (buffLen > 1) {
                const timeStored = sigSet.buffer[buffLen - 1].ts - sigSet.buffer[0].ts;
                const realTimeStored = timeStored / this.dataAccess.playbackSpeedFactor;

                const avgBucketCountPerMs = buffLen / realTimeStored;
                timeStoredBucketLimit = Math.floor(
                    (this.conf.maxTimeStored - realTimeStored) * avgBucketCountPerMs
                );
            }

            const bucketCount = Math.min(
                this.conf.maxKeyframesStored - buffLen,
                timeStoredBucketLimit,
                sigSet.lastBucketCount * 2
            );

            queries.push(this._getNextChunkQuery(
                sigSet,
                sigSet.nextChunkBeginTs,
                bucketCount
            ));
        }

        return queries;
    }
    processNextChunkQueries(qryResults, queries) {
        const fetchedSigSetCids = queries.map(qry => qry.args[0]);
        for (const sigSetCid of fetchedSigSetCids) {
            const sigSet = this.sigSets[sigSetCid];
            const sigSetQryBuckets = qryResults.shift()[0].buckets;
            const sigSetQries = queries.shift();

            this._processNextChunkBuckets(
                sigSet,
                sigSetQryBuckets,
                sigSetQries
            );
        }
    }

    _reset() {
        for (const sigSet of Object.values(this.sigSets)) {
            sigSet.buffer = [];
            sigSet.history = [];
            sigSet.hasMoreData = true;

            sigSet.intp.clearArgs();
        }

        this.timePillowFactor = 1;
    }
    _getSigSetsToFetch(maxPredictedFetchTime) {
        const intpArity = this.conf.intpArity;
        const speedFact = this.dataAccess.playbackSpeedFactor;
        return Object.values(this.sigSets).filter(sigSet => {
            //Leaving out the currently interpolated keyframes, because in the
            //worst case scenario, the keyframe window is goint to shift next
            //refresh.
            const storedTime = sigSet.buffer.length <= intpArity ? 0 :
                sigSet.buffer[sigSet.buffer.length - 1].ts - sigSet.buffer[intpArity - 1].ts
            ;

            return sigSet.hasMoreData &&
                (storedTime - inactiveTabTimePillow) / speedFact <= this.timePillowFactor * maxPredictedFetchTime;
        });
    }

    _processNextChunkBuckets(sigSet, buckets, nextChunkQry) {
        //Due to aggregation intervals behaviour, we sometimes get a kf twice
        const lastBufferTs = sigSet.buffer.length > 0 ? sigSet.buffer[sigSet.buffer.length - 1].ts : -1;
        const kfs = buckets.map(this._bucketToKeyframe);
        const firstKfIdx = kfs.findIndex(kf => kf.ts > lastBufferTs);

        if (firstKfIdx >= 0) {
            sigSet.buffer.push(...kfs.slice(firstKfIdx));
        }

        const qryAggs = nextChunkQry.args[2];
        const wantedBucketCount = qryAggs[0].limit;

        sigSet.hasMoreData = buckets.length === wantedBucketCount;
        sigSet.lastBucketCount = buckets.length;

        sigSet.nextChunkBeginTs = sigSet.buffer.length > 0 ?
            sigSet.buffer[sigSet.buffer.length - 1].ts :
            //If no buckets were fetched, there is no more data (or chunks)
            null;
    }
    _bucketToKeyframe(bucket) {
        return {
            ts: Date.parse(bucket.key),
            data: bucket.values,
        };
    }

    _getNextChunkQuery(sigSet, beginTs, bucketCount) {
        return {
            type: "aggs",
            args: [
                sigSet.cid,
                {
                    type: "range",
                    sigCid: sigSet.tsSigCid,
                    gt: moment(beginTs).toISOString(),
                },
                this._getQueryAggs(sigSet, bucketCount, "asc")
            ]
        };
    }
    _getFirstKeyframeQuery(sigSet, beginTs) {
        return {
            type: "aggs",
            args: [
                sigSet.cid,
                {
                    type: "range",
                    sigCid: sigSet.tsSigCid,
                    lte: moment(beginTs).toISOString(),
                },
                this._getQueryAggs(sigSet, 1, "desc")
            ]
        };
    }
    _getHistoryQuery(sigSet, beginTs) {
        const lt = moment(beginTs);
        const gte = moment(lt.valueOf() - this.conf.history);

        return {
            type: "aggs",
            args: [
                sigSet.cid,
                {
                    type: "range",
                    sigCid: sigSet.tsSigCid,
                    lt: lt.toISOString(),
                    gte: gte.toISOString(),
                },
                this._getQueryAggs(sigSet, null, 'asc')
            ]
        };
    }

    _getQueryAggs(sigSet, limit, order) {
        const step = this.conf.getAggStep();
        const offset = this.conf.getAggOffset(step);

        return [
            {
                sigCid: sigSet.tsSigCid,
                step: step.toString(),
                offset: offset.toString(),
                minDocCount: 1,
                signals: sigSet.signals,
                limit,
                order,
            }
        ];
    }
}

class TimeSeriesDataSource {
    constructor(config, dataAccess) {
        this.dataAccess = dataAccess;

        this.conf = {
            intpArity: config.interpolation.arity,

            getAggStep: () => this.dataAccess.getIntervalAbsolute().aggregationInterval,
            getAggOffset: (aggStep) => moment.duration(
                this.dataAccess.getIntervalAbsolute().from.valueOf() % aggStep.asMilliseconds()
            ),
        };

        const signalAggs = config.signalAggs || ['avg'];

        this.querySigSets = {};
        this.sigSets = [];
        for (const sigSetConf of config.sigSets) {
            const signals = {};

            for (const sigConf of sigSetConf.signals) {
                if (sigConf.generate) {
                    signals[sigConf.cid] = {
                        generate: sigConf.generate,
                    };
                } else if (sigConf.mutate) {
                    signals[sigConf.cid] = {
                        mutate: sigConf.mutate,
                        aggs: signalAggs,
                    };
                } else {
                    signals[sigConf.cid] = signalAggs;
                }
            }

            this.querySigSets[sigSetConf.cid] = {
                tsSigCid: sigSetConf.tsSigCid,
                signals
            };

            this.sigSets.push({
                cid: sigSetConf.cid,
                intp: new SigSetInterpolator(
                    sigSetConf.signals.map(s => s.cid),
                    signalAggs,
                    config.interpolation
                ),
            });
        }

        this._reset();
    }

    _reset() {
        this.lastSeekInterval = null;

        for (const sigSet of this.sigSets) {
            sigSet.data = {};
            sigSet.startIdx = 0;

            sigSet.intp.clearArgs();
        }
    }

    canShiftTo() {
        return true;
    }

    shiftTo(ts) {
        const data = {};
        const arity = this.conf.intpArity;
        for (const sigSet of this.sigSets) {
            const main = sigSet.data.main;

            if (main.length === 0 || ts < main[0].ts.valueOf()) {
                const shiftedData = {main: []};

                if (sigSet.data.prev && sigSet.data.prev.ts.valueOf() < ts) {
                    shiftedData.prev = sigSet.data.prev;

                    sigSet.intp.rebuildArgs([sigSet.data.prev, ...main.slice(0, arity - 1)]);
                    shiftedData.main.push({ts: moment(ts), data: sigSet.intp.interpolate(ts)});
                    sigSet.intp.hasCachedArgs = false;
                }

                data[sigSet.cid] = shiftedData;
                continue;
            }

            if (ts >= main[main.length - 1].ts.valueOf()) {
                const shiftedData = { main };

                if (sigSet.data.prev) shiftedData.prev = sigSet.data.prev;
                if (sigSet.data.next) shiftedData.next = sigSet.data.next;

                data[sigSet.cid] = shiftedData;
                continue;
            }

            const needsShift = () => main[sigSet.startIdx + arity - 1].ts.valueOf() < ts;
            if (needsShift()) {
                while (needsShift()) {
                    sigSet.startIdx = Math.min(
                        main.length - arity,
                        sigSet.startIdx + arity - 1
                    );
                }

                sigSet.intp.rebuildArgs(main, sigSet.startIdx);
            } else if (!sigSet.intp.hasCachedArgs) {
                sigSet.intp.rebuildArgs(main, sigSet.startIdx);
            }

            const shiftedData = {
                main: main.slice(0, sigSet.startIdx + 1),
            };

            shiftedData.main.push({ts: moment(ts), data: sigSet.intp.interpolate(ts)});

            if (sigSet.data.prev) shiftedData.prev = sigSet.data.prev;

            data[sigSet.cid] = shiftedData;
        }

        return data;
    }

    getEmptyData() {
        const emptyData = {};
        for (const sigSet of this.sigSets) {
            emptyData[sigSet.cid] = { main: [] };
        }

        return emptyData;
    }

    didMissFetch() {}
    getSeekQueries(ts) {
        this.lastSeekTo = ts;
        const intvAbs = this.dataAccess.getIntervalAbsolute();

        const sameAggregationInterval = () => {
            const prev = this.lastSeekInterval.aggregationInterval;
            const curr = intvAbs.aggregationInterval;

            return (prev === null && curr === null) ||
                (prev !== null && curr !== null && prev.asMilliseconds() === curr.asMilliseconds());
        };

        if (this.lastSeekInterval &&
            this.lastSeekInterval.from === intvAbs.from.valueOf() &&
            this.lastSeekInterval.to === intvAbs.to.valueOf() &&
            sameAggregationInterval()) {

            return [];
        }

        const queries = [
            {
                type: "timeSeries",
                args: [ this.querySigSets, intvAbs ]
            }
        ];

        return queries;
    }
    processSeekQueries(qryResults, queries) {
        if (qryResults.length !== 0) {

            this._reset();

            const intvAbs = queries[0].args[1];
            this.lastSeekInterval = {
                from: intvAbs.from.valueOf(),
                to: intvAbs.to.valueOf(),
                aggregationInterval: intvAbs.aggregationInterval
            };

            for (const sigSet of this.sigSets) {
                sigSet.data = qryResults[0][sigSet.cid];
            }
        } else {
            for (const sigSet of this.sigSets) {
                sigSet.intp.clearArgs();

                sigSet.startIdx = Math.min(
                    Math.max(0, sigSet.data.main.findIndex(kf => kf.ts.valueOf() > this.lastSeekTo)),
                    sigSet.data.main.length - this.conf.intpArity
                );
            }
        }
    }

    getNextChunkQueries() {
        return [];
    }
    processNextChunkQueries() {}
}

const dataSources = {
    generic: GenericDataSource,
    timeSeries: TimeSeriesDataSource,
};

@withComponentMixins([intervalAccessMixin()])
class AnimationDataAccess extends Component {
    static propTypes = {
        dataSources: PropTypes.object.isRequired,
        render: PropTypes.func.isRequired,
    }

    constructor(props) {
        super(props);

        this.state = {
            seek: ::this.seek,
            refreshTo: ::this.refreshTo,
            setPlaybackSpeedFactor: ::this.setPlaybackSpeedFactor,
            getEmptyData: ::this.getEmptyData,

            fetchError: null,
            needsReseek: false,
        };

        this.maxFetchTime = 0;

        this.runNextChunkQueries = (dtSrcKeys) => this.runQueries(dtSrcKeys, "getNextChunkQueries", [this.maxFetchTime], "processNextChunkQueries");
        this.reset();
    }

    componentDidUpdate(prevProps) {
        if (!_.isEqual(this.props.dataSources, prevProps.dataSources)) {
            this.reset();
            this.setState({needsReseek: true});
        }
    }

    async seek(ts) {
        if (this.state.needsReseek) this.setState({needsReseek: false});

        const wasLatestFetch = await this.runQueries(Object.keys(this.dataSources), "getSeekQueries", [ts], "processSeekQueries");

        if (!wasLatestFetch) return null;

        return this.shiftTo(ts);
    }

    refreshTo(ts) {
        if (this.state.needsReseek) return {data: null};

        const dataSourcesToFetch = Object.keys(this.dataSources).filter(dataSrcKey => !this.dataSources[dataSrcKey].canShiftTo(ts));

        if (dataSourcesToFetch.length === 0) {
            if (!this.nextFetchPromise) {
                this.runNextChunkQueries(Object.keys(this.dataSources));
            }

            return {data: this.shiftTo(ts)};
        }

        //Needs to fetch, but one is already under way.
        if (this.nextFetchPromise) return {data: null};

        dataSourcesToFetch.map(dtSrcKey => this.dataSources[dtSrcKey].didMissFetch());
        this.runNextChunkQueries(dataSourcesToFetch);
        const promise = this.nextFetchPromise.then(wasLatestFetch => {
            if (!wasLatestFetch || this.state.needsReseek) return null;

            return this.shiftTo(ts);
        });

        return {promise};
    }

    setPlaybackSpeedFactor(factor) {
        this.playbackSpeedFactor = factor;
    }

    getEmptyData() {
        const emptDt = {};
        for (const dtSrcKey of Object.keys(this.dataSources)) {
            emptDt[dtSrcKey] = this.dataSources[dtSrcKey].getEmptyData();
        }

        return emptDt;
    }


    @withAsyncErrorHandler
    async runQueries(dataSrcKeys, getQueriesFuncName, getQueriesFuncArgs, processQueriesFuncName) {
        const _runQueries = async () => {
            const lengths = [];
            const querySetOwners = [];
            const queries = [];

            for (const dataSrcKey of dataSrcKeys) {
                const querySet = this.dataSources[dataSrcKey][getQueriesFuncName](...getQueriesFuncArgs);

                queries.push(...querySet);
                lengths.push(querySet.length);
                querySetOwners.push(dataSrcKey);
            }

            if (queries.length == 0) return true;

            const results = await this.dataAccSession.getLatestMixed(queries);

            if (results === null) return false;

            for (let i = 0; i < querySetOwners.length; i++) {
                const owner = this.dataSources[querySetOwners[i]];
                const querySetLength = lengths[i];
                const resultSet = results.splice(0, querySetLength);
                const querySet = queries.splice(0, querySetLength);

                owner[processQueriesFuncName](resultSet, querySet);
            }

            return true;
        };

        this.nextFetchPromise = _runQueries();
        const beforeFetchTs = performance.now();

        const wasLatestFetch = await this.nextFetchPromise;

        this.nextFetchPromise = null;
        this.maxFetchTime = Math.max(this.maxFetchTime, performance.now() - beforeFetchTs);

        return wasLatestFetch;
    }
    shiftTo(ts) {
        const data = {};

        for (const dataSrcKey of Object.keys(this.dataSources)) {
            data[dataSrcKey] = this.dataSources[dataSrcKey].shiftTo(ts);
        }

        return data;
    }

    errorHandler(error) {
        this.setState({fetchError: error, needsReseek: true});

        return true;
    }
    getPlaybackSpeedFactorBasedAggStep(minFramesPerKeyframe) {
        //requestAnimationFrame has variable refresh interval, which should
        //match the refresh interval of the screen --- usually 60 FPS.
        return moment.duration(minFramesPerKeyframe * 1000/60 * this.playbackSpeedFactor);
    }

    reset() {
        this.dataAccSession = new DataAccessSession();
        this.nextFetchPromise = null;

        this.dataSources = {};
        for (const dataSrcKey of Object.keys(this.props.dataSources)) {
            const config = this.props.dataSources[dataSrcKey];
            const DataSourceType = dataSources[config.type] || "generic";

            this.dataSources[dataSrcKey] = new DataSourceType(config, this);
        }
    }

    render() {
        return this.props.render({...this.state});
    }
}

@withComponentMixins([intervalAccessMixin()])
class Animation extends Component {
    static propTypes = {
        initialStatus: PropTypes.object.isRequired,

        seek: PropTypes.func.isRequired,
        refreshTo: PropTypes.func.isRequired,
        setPlaybackSpeedFactor: PropTypes.func.isRequired,
        getEmptyData: PropTypes.func.isRequired,
        needsReseek: PropTypes.bool,
        fetchError: PropTypes.object,

        children: PropTypes.node,
    }

    constructor(props) {
        super(props);

        this.state = {
            status: this.resetStatus(false),
            controls: {
                play: ::this.playHandler,
                pause: ::this.pauseHandler,
                seek: ::this.seekHandler,
                stop: ::this.stopHandler,
                jumpForward: ::this.jumpForwardHandler,
                jumpBackward: ::this.jumpBackwardHandler,
                changeSpeed: ::this.changePlaybackSpeedHandler,
            },
            animationData: props.getEmptyData(),
        };

        this.nextFrameId = null;
        this.refreshBound = ::this.refresh;
        this.errorHandlerBound = ::this.errorHandler;
    }

    componentDidUpdate(prevProps) {
        if (this.props.fetchError && !prevProps.fetchError) {
            this.errorHandler(this.props.fetchError);
            return;
        }

        const prevIntvSpec = this.getIntervalSpec(prevProps);
        const currIntvSpec = this.getIntervalSpec();
        const sameIntv = prevIntvSpec.from === currIntvSpec.from && prevIntvSpec.to === currIntvSpec.to;
        if (!sameIntv) {
            this.seekHandler(this.getIntervalAbsolute().from.valueOf());
        } else if (this.props.needsReseek && !prevProps.needsReseek) {
            this.seekHandler(this.state.status.position);
        }
    }

    componentWillUnmount() {
        this.stopRefreshing();
    }

    componentDidMount() {
        this.changePlaybackSpeedHandler(this.state.status.playbackSpeedFactor);
        this.seekHandler(this.state.status.position);

        if (this.state.status.isPlaying) this.playHandler();
    }

    resetStatus(withUpdate) {
        const is = this.props.initialStatus;
        const startingPos = is.position != null && !Number.isNaN(is.position) ?
            this.clampPos(is.position) :
            this.getIntervalAbsolute().from.valueOf();

        let speedFactor = is.playbackSpeedFactor;
        if (speedFactor == undefined || Number.isNaN(speedFactor) || speedFactor <= 0) {
            speedFactor = 1;
        }


        const newStatus = {
            isBuffering: true,
            isPlaying: is.isPlaying,
            playbackSpeedFactor: speedFactor,
            position: startingPos,
        };

        if (withUpdate) {
            this.changePlaybackSpeedHandler(newStatus.playbackSpeedFactor);
            this.seekHandler(newStatus.position);

            if (newStatus.isPlaying) this.playHandler();
        }

        return newStatus;
    }

    clampPos(pos) {
        const minPosition = this.getIntervalAbsolute().from.valueOf();
        const maxPosition = this.getIntervalAbsolute().to.valueOf();
        return Math.min(maxPosition, Math.max(minPosition, pos));
    }


    errorHandler(error) {
        console.error(error);

        this.stopRefreshing();
        this.setState({controls: {}});
        this.setStatus({error});

        return true;
    }

    playHandler() {
        this.startRefreshing();
        this.setStatus({isPlaying: true});
    }

    pauseHandler() {
        this.stopRefreshing();
        this.setStatus({isPlaying: false});
    }

    stopHandler() {
        if (this.state.status.isPlaying) this.pauseHandler();
        this.seekHandler(this.getIntervalAbsolute().from.valueOf());
    }

    jumpForwardHandler(shiftMs) {
        this.seekHandler(this.state.status.position + shiftMs);
    }

    jumpBackwardHandler(shiftMs) {
        this.seekHandler(this.state.status.position - shiftMs);
    }

    changePlaybackSpeedHandler(factor) {
        this.props.setPlaybackSpeedFactor(factor);
        this.setStatus({playbackSpeedFactor: factor});
    }

    @withAsyncErrorHandler
    async seekHandler(ts) {
        const clampedTs = this.clampPos(ts);

        this.setStatus({position: clampedTs, isBuffering: true});

        const animData = await this.props.seek(clampedTs);

        if (animData !== null) {
            this.setState({animationData: animData});
            this.setStatus({isBuffering: this.state.status.isPlaying});
        }
    }

    refresh(msSinceOrigin) {
        const interval = this.savedInterval || msSinceOrigin - this.lastRefreshTs;
        this.savedInterval = null;
        this.lastRefreshTs = performance.now();

        const endPosition = this.getIntervalAbsolute().to.valueOf();
        const nextPosition = Math.min(
            endPosition,
            this.state.status.position + (this.state.status.playbackSpeedFactor * interval)
        );

        const {data, promise} = this.props.refreshTo(nextPosition);

        if (!data) {
            if (!this.state.status.isBuffering)
                this.setStatus({isBuffering: true});

            this.savedInterval = interval;
            this.nextFrameId = requestAnimationFrame(this.refreshBound);

            if (promise) {
                const position = this.state.status.position;
                promise.then(data => {
                    if (data && this.state.status.position === position) {
                        this.setState({animationData: data});
                    }
                }).catch(this.errorHandlerBound);
            }

            return;
        }

        this.setState(state => {
            const nextStatus = Object.assign({}, state.status, {isBuffering: false, position: nextPosition});
            return {status: nextStatus, animationData: data};
        });


        if (nextPosition !== endPosition) {
            this.nextFrameId = requestAnimationFrame(this.refreshBound);
        } else {
            this.pauseHandler();
        }
    }

    startRefreshing() {
        if (this.isRefreshing) return;
        this.isRefreshing = true;

        this.lastRefreshTs = performance.now();
        this.nextFrameId = requestAnimationFrame(this.refreshBound);
    }

    scheduleRefresh() {
    }

    stopRefreshing() {
        this.isRefreshing = false;
        cancelAnimationFrame(this.nextFrameId);
    }

    setStatus(nextStatus) {
        this.setState(prevState => {
            const newStatus = Object.assign({}, prevState.status, nextStatus);

            return {status: newStatus};
        });
    }

    render() {
        return (
            <AnimationStatusContext.Provider value={this.state.status}>
                <AnimationControlContext.Provider value={this.state.controls}>
                    <AnimationDataContext.Provider value={this.state.animationData}>
                        {this.props.children}
                    </AnimationDataContext.Provider>
                </AnimationControlContext.Provider>
            </AnimationStatusContext.Provider>
        );
    }
}

export {
    RecordedAnimation
};
