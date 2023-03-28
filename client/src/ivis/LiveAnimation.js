import React, {Component} from "react";
import PropTypes from "prop-types";
import moment from "moment";
import _ from "lodash";

import axios from "../lib/axios";
import {getUrl} from "../lib/urls";
import {
    AnimationStatusContext,
    AnimationControlContext,
    AnimationDataContext,
} from "./AnimationCommon";
import {SigSetInterpolator} from "../lib/animation-helpers";
import {withAsyncErrorHandler} from "../lib/error-handling";
import {withComponentMixins} from "../lib/decorator-helpers";
import {intervalAccessMixin, TimeContext} from "./TimeContext";
import {IntervalSpec} from "./TimeInterval";

const defaultPollRate = 1000;
const minPollRate = 50;

class LiveAnimation extends Component {
    static propTypes = {
        dataSources: PropTypes.object.isRequired,
        animationId: PropTypes.string.isRequired,

        intervalSpanBefore: PropTypes.object,
        intervalSpanAfter: PropTypes.object,

        initialStatus: PropTypes.object,

        pollRate: PropTypes.number,

        children: PropTypes.node,
    }

    static defaultProps = {
        intervalSpanBefore: moment.duration(10, 'm'),
        intervalSpanAfter: moment.duration(3, 'm'),

        pollRate: defaultPollRate,
        initialStatus: {},
    }

    constructor(props) {
        super(props);

        this.initialIntervalSpec = new IntervalSpec(
            moment(Date.now() - props.intervalSpanBefore.asMilliseconds()),
            moment(Date.now() + props.intervalSpanAfter.asMilliseconds()),
            null,
            null
        );
    }

    render() {
        const pollRate = this.props.pollRate === null || Number.isNaN(this.props.pollRate) ?
            minPollRate :
            Math.max(minPollRate, this.props.pollRate)
        ;


        const childrenRender = (props) => {
            return (
                <Animation
                    animationId={this.props.animationId}
                    pollRate={pollRate}

                    intervalSpanBefore={this.props.intervalSpanBefore}
                    intervalSpanAfter={this.props.intervalSpanAfter}

                    initialStatus={this.props.initialStatus}
                    {...props}>
                    {this.props.children}
                </Animation>
            );
        };


        return (
            <TimeContext
                initialIntervalSpec={this.initialIntervalSpec}
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
        this.conf = {
            formatData: config.formatData || null,
            history: config.history || null,
            intpArity: config.interpolation.arity,
            signalAggs: config.signalAggs || ['avg'],
        };

        this.dataAccess = dataAccess;

        this.sigSets = [];
        for (const sigSetConf of config.sigSets) {
            const signalCids = sigSetConf.signalCids;
            this.sigSets.push({
                cid: sigSetConf.cid,
                signalCids,
                intp: new SigSetInterpolator(signalCids, this.conf.signalAggs, config.interpolation),
            });
        }

        this.clear();
    }

    addKeyframe(kf) {
        const data = this.conf.formatData ? this.conf.formatData(kf.data) : kf.data;

        this.buffer.push({ts: kf.ts, data});
    }

    clear() {
        for (const sigSet of this.sigSets) {
            sigSet.intp.clearArgs();
        }

        this.buffer = [];
        this.history = [];

        this.tss = [];
        this.lastShiftNull = true;
        this.kfPillow = 0;
    }

    getEmptyData() {
        const emptyData = {};
        for (const sigSet of this.sigSets) {
            if (this.conf.history) emptyData[sigSet.cid] = [];
            else emptyData[sigSet.cid] = sigSet.intp.interpolate(-1);
        }

        return emptyData;
    }

    shiftTo(ts) {
        let minKfCount = this.conf.intpArity;

        if (this.lastShiftNull) {
            minKfCount += this.kfPillow;
        }

        const result = this._shiftTo(ts, minKfCount);

        if (!this.lastShiftNull && result === null) {
            this.kfPillow += 1;
        }
        this.lastShiftNull = result === null;

        return result;
    }

    _shiftTo(ts, minKfCount) {
        if (this.buffer.length < minKfCount) return null;

        if (this.conf.history) {
            const historyLastTs = this.history.length > 0 ? this.history[this.history.length - 1].ts : -1;
            let i = this.buffer.findIndex(kf => kf.ts > historyLastTs);
            while (i >= 0 && this.buffer.length > i && this.buffer[i].ts < ts) {
                this.history.push(this.buffer[i]);
                i++;
            }

            const minTs = ts - this.conf.history;
            const newHistoryStartIdx = this.history.findIndex(kf => kf.ts >= minTs);
            this.history.splice(0, newHistoryStartIdx);
        }

        const intpArity = this.conf.intpArity;
        let kfsChanged = false;
        while (this.buffer[intpArity - 1].ts < ts && this.buffer.length > intpArity) {
            const delCount = Math.min(
                intpArity - 1,
                this.buffer.length - intpArity
            );
            kfsChanged = true;

            this.buffer.splice(0, delCount);
        }

        if (this.buffer[intpArity - 1].ts < ts) return null;

        const data = {};
        const getSigSetKf = (cid, kf) => ({ts: kf.ts, data: kf.data[cid]});
        for (const sigSet of this.sigSets) {
            if (kfsChanged || !sigSet.intp.hasCachedArgs) {
                const sigSetBuffer = [];
                for (let i = 0; i < intpArity; i++) {
                    sigSetBuffer.push(getSigSetKf(sigSet.cid, this.buffer[i]));
                }

                sigSet.intp.rebuildArgs(sigSetBuffer);
            }

            const currentData = sigSet.intp.interpolate(ts);
            if (this.conf.history) {
                const sigSetHistory = this.history.map(kf => getSigSetKf(sigSet.cid, kf));
                sigSetHistory.push({ts, data: currentData});
                data[sigSet.cid] = sigSetHistory;
            } else {
                data[sigSet.cid] = currentData;
            }
        }

        return data;
    }
}

class TimeSeriesDataSource extends GenericDataSource{
    constructor(config, dataAccess) {
        super({...config}, dataAccess);

        this.lastGenDataRev = [];
    }

    shiftTo(ts) {
        const prevs = this._getPrevs();

        const absIntv = this.dataAccess.getIntervalAbsolute();
        this.conf.history = absIntv.to.valueOf() - absIntv.from.valueOf();

        const genericData = super.shiftTo(ts);

        if (genericData === null) return null;

        const tsToMoment = (kf) => {
            kf.ts = moment(kf.ts);
            return kf;
        };

        const data = {};
        for (const sigSet of this.sigSets) {
            data[sigSet.cid] = {
                main: genericData[sigSet.cid].map(tsToMoment),
            };

            if (prevs) {
                data[sigSet.cid].prev = prevs[sigSet.cid];
            }
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

    _getPrevs(ts) {
        const findPrevIdx = arr => {
            let i = 0;
            while (i < arr.length && arr[i].ts <= ts) i++;

            if (i === arr.length || i === 0) return null;
            else return i-1;
        };

        let prevIdx = findPrevIdx(this.history);
        let arr = this.history;
        if (prevIdx === null) {
            prevIdx = findPrevIdx(this.buffer);
            arr = this.buffer;
        }

        let prevs = null;
        if (prevIdx !== null) {
            prevs = {};
            for (const sigSet of this.sigSets) {
                prevs[sigSet.cid] = arr[prevIdx].data[sigSet.cid];
            }
        }

        return prevs;
    }
}

const dataSourceTypes = {
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
            addKeyframe: ::this.addKeyframe,
            clearKeyframes: ::this.clearKeyframes,
            shiftTo: ::this.shiftTo,
            getEmptyData: ::this.getEmptyData,

            dataSources: props.dataSources,
        };

        this.resetDataSources();
    }

    componentDidUpdate(prevProps) {
        if (!_.isEqual(this.props.dataSources, prevProps.dataSources)) {
            this.resetDataSources();
            this.setState({dataSources: this.props.dataSources});
        }
    }

    addKeyframe(kf) {
        for (const dtSrcKey of Object.keys(this.dataSources)) {
            this.dataSources[dtSrcKey].addKeyframe(kf);
        }
    }

    clearKeyframes() {
        for (const dtSrcKey of Object.keys(this.dataSources)) {
            this.dataSources[dtSrcKey].clear();
        }
    }

    shiftTo(ts) {
        const data = {};
        for (const dtSrcKey of Object.keys(this.dataSources)) {
            data[dtSrcKey] = this.dataSources[dtSrcKey].shiftTo(ts);
            if (data[dtSrcKey] === null) return null;
        }

        return data;
    }

    getEmptyData() {
        const data = {};
        for (const dtSrcKey of Object.keys(this.dataSources)) {
            data[dtSrcKey] = this.dataSources[dtSrcKey].getEmptyData();
        }

        return data;
    }

    resetDataSources() {
        this.dataSources = {};
        const dtSourceConfigs = this.props.dataSources;
        for (const dtSrcKey of Object.keys(dtSourceConfigs)) {
            const config = dtSourceConfigs[dtSrcKey];
            const DataSourceType = dataSourceTypes[config.type];

            this.dataSources[dtSrcKey] = new DataSourceType(config, this);
        }
    }

    render() {
        return this.props.render({...this.state});
    }
}

@withComponentMixins([intervalAccessMixin()])
class Animation extends Component {
    static propTypes = {
        pollRate: PropTypes.number.isRequired,
        animationId: PropTypes.string.isRequired,

        initialStatus: PropTypes.object.isRequired,

        intervalSpanBefore: PropTypes.object.isRequired,
        intervalSpanAfter: PropTypes.object.isRequired,

        addKeyframe: PropTypes.func.isRequired,
        clearKeyframes: PropTypes.func.isRequired,
        shiftTo: PropTypes.func.isRequired,
        getEmptyData: PropTypes.func.isRequired,

        dataSources: PropTypes.object.isRequired,

        children: PropTypes.node,
    }

    constructor(props) {
        super(props);

        this.state = {
            status: this.getInitStatus(),
            controls: {
                play: ::this.play,
                pause: ::this.pause
            },
            animationData: props.getEmptyData(),
        };
        this.isRefreshing = false;
        this.refreshBound = ::this.refresh;
    }

    componentDidUpdate(prevProps) {
        if (this.props.pollRate !== prevProps.pollRate) {
            clearInterval(this.fetchStatusInterval);
            this.fetchStatusInterval = setInterval(::this.fetchStatus, this.props.pollRate);
        }

        if (this.props.animationId !== prevProps.animationId ||
            this.props.dataSources !== prevProps.dataSources) {
            this.masterReset();
        }

        if (this.props.intervalSpanBefore.asMilliseconds() !== prevProps.intervalSpanBefore.asMilliseconds()||
            this.props.intervalSpanAfter.asMilliseconds() !== prevProps.intervalSpanAfter.asMilliseconds()) {
            this.updateInterval();
        }
    }

    componentDidMount() {
        if (this.state.status.isPlaying) this.play();
        this.fetchStatusInterval = setInterval(::this.fetchStatus, this.props.pollRate);
    }

    componentWillUnmount() {
        cancelAnimationFrame(this.nextFrameId);
        clearInterval(this.fetchStatusInterval);
    }

    masterReset() {
        this.pause();

        const initStatus = this.getInitStatus();
        this.setStatus(initStatus);
        if (initStatus.isPlaying) {
            this.play();
        }

        this.props.clearKeyframes();
        this.setState({animationData: this.props.getEmptyData()});
    }

    errorHandler(error) {
        console.error(error);

        cancelAnimationFrame(this.nextFrameId);
        clearInterval(this.fetchStatusInterval);
        this.setState({controls: {}});
        this.setStatus({error});

        return true;
    }

    getInitStatus() {
        const initialStatus = this.props.initialStatus;

        const newStatus = {
            isBuffering: false,
            isPlaying: !!initialStatus.isPlaying,
            position: Date.now(),
            playbackSpeedFactor: 1,
        };

        return newStatus;
    }

    updateInterval(currentPosition = this.state.status.position) {
        const from = moment(currentPosition - this.props.intervalSpanBefore.asMilliseconds());
        const to = moment(currentPosition + this.props.intervalSpanAfter.asMilliseconds());
        const newSpec = new IntervalSpec(
            from,
            to,
            null,
            null
        );

        this.getInterval().setSpec(newSpec, true);
    }

    handleNewStatus(newStatus) {
        const nextStatus = {};

        if (newStatus.isPlaying && !this.isRefreshing) {
            nextStatus.position = newStatus.position;
            this.handlePlay(nextStatus);
        } else if (!newStatus && this.isRefreshing) {
            this.handlePause(nextStatus);
        }

        if (newStatus.isPlaying) {
            const keyframe = { data: newStatus.data, ts: newStatus.position};

            this.props.addKeyframe(keyframe);
        }

        if (Object.keys(nextStatus).length > 0) {
            this.setStatus(nextStatus);
        }
    }

    setStatus(status) {
        this.setState((prevState) => {
            const newStatus = Object.assign({}, prevState.status, status);
            if (newStatus.position !== prevState.status.position) {
                this.updateInterval(newStatus.position);
            }

            return {status: newStatus};
        });
    }


    refresh(elapsedTs) {
        const interval = this.savedInterval || elapsedTs - this.lastRefreshTs;
        this.savedInterval = null;

        this.lastRefreshTs = performance.now();
        const nextPosition = this.state.status.position + interval;

        const data = this.props.shiftTo(nextPosition);

        if (data === null) {
            this.savedInterval = interval;
            if (!this.state.status.isBuffering)
                this.setStatus({isBuffering: true});
        } else {
            this.setState({animationData: data});
            this.setStatus({position: nextPosition, isBuffering: false});
        }

        this.nextFrameId = requestAnimationFrame(this.refreshBound);
    }

    handlePlay(nextStatus = {}) {
        if (this.isRefreshing) return nextStatus;

        this.isRefreshing = true;
        nextStatus.isPlaying = true;
        nextStatus.isBuffering = true;

        this.props.clearKeyframes();

        this.lastRefreshTs = performance.now();
        this.nextFrameId = requestAnimationFrame(::this.refresh);

        return nextStatus;
    }

    handlePause(nextStatus = {}) {
        this.isRefreshing = false;

        cancelAnimationFrame(this.nextFrameId);
        nextStatus.isPlaying = false;
        nextStatus.isBuffering = false;

        return nextStatus;
    }


    play() {
        this.setStatus({isPlaying: true, isBuffering: true});
        this.sendControlRequest("play");
    }

    pause() {
        this.setStatus(this.handlePause());
        this.sendControlRequest("pause");
    }

    @withAsyncErrorHandler
    async sendControlRequest(controlName) {
        const url = getUrl("rest/animation/" + this.props.animationId + "/" + controlName);
        const ctrlPromise = axios.post(url);

        this.fetchStatus();

        await ctrlPromise;
    }

    @withAsyncErrorHandler
    async fetchStatus() {
        const animationId = this.props.animationId;
        const url = getUrl("rest/animation/" + animationId + "/status");
        const res = await axios.get(url);

        if (this.props.animationId === animationId) {
            this.handleNewStatus(res.data);
        }
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
    LiveAnimation
};
