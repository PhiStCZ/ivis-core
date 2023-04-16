'use strict';

import React, {Component} from "react";
import * as d3Axis from "d3-axis";
import * as d3Scale from "d3-scale";
import {event as d3Event, select} from "d3-selection";
import * as d3Brush from "d3-brush";
import {intervalAccessMixin} from "./TimeContext";
import {DataAccessSession} from "./DataAccess";
import {withAsyncErrorHandler, withErrorHandling} from "../lib/error-handling";
import interoperableErrors from "../../../shared/interoperable-errors";
import PropTypes from "prop-types";
import {IntervalSpec} from "./TimeInterval";
import {Tooltip} from "./Tooltip";
import tooltipStyles from "./Tooltip.scss";
import * as dateMath from "../lib/datemath";
import {Icon} from "../lib/bootstrap-components";
import {withComponentMixins} from "../lib/decorator-helpers";
import {withTranslation} from "../lib/i18n";
import {areZoomTransformsEqual, ConfigDifference, setZoomTransform, transitionInterpolate, wheelDelta} from "./common";
import * as d3Zoom from "d3-zoom";
import commonStyles from "./commons.scss";
import timeBasedChartBaseStyles from "./TimeBasedChartBase.scss";
import {PropType_d3Color} from "../lib/CustomPropTypes";
import {rangeAccessMixin} from "./RangeContext";

export function createBase(base, self) {
    self.base = base;
    return self;
}

export function isSignalVisible(sigConf) {
    return ('label' in sigConf) && (!('enabled' in sigConf) || sigConf.enabled);
}

class TooltipContent extends Component {
    constructor(props) {
        super(props);
    }

    static propTypes = {
        config: PropTypes.array.isRequired,
        signalSetsData: PropTypes.object,
        selection: PropTypes.object,
        getSignalValues: PropTypes.func.isRequired
    }

    render() {
        if (this.props.selection) {
            const rows = [];
            let ts;

            let sigSetIdx = 0;
            for (const sigSetConf of this.props.config) {
                const sel = this.props.selection[sigSetConf.cid];
                const isAgg = this.props.signalSetsData[sigSetConf.cid].isAggregated;

                if (sel) {
                    ts = sel.ts;
                    let sigIdx = 0;
                    for (const sigConf of sigSetConf.signals) {
                        if (isSignalVisible(sigConf)) {
                            const sigVals = this.props.getSignalValues(this, sigSetConf, sigConf, sigSetConf.cid, sigConf.cid, sel.data[sigConf.cid], isAgg);

                            if (sigVals) {
                                rows.push(
                                    <div key={`${sigSetIdx} ${sigIdx}`}>
                                        <span className={tooltipStyles.signalColor} style={{color: sigConf.color}}><Icon
                                            icon="minus"/></span>
                                        <span className={tooltipStyles.signalLabel}>{sigConf.label}:</span>
                                        {this.props.getSignalValues(this, sigSetConf, sigConf, sigSetConf.cid, sigConf.cid, sel.data[sigConf.cid], isAgg)}
                                    </div>
                                );
                            }
                        }

                        sigIdx += 1;
                    }
                }

                sigSetIdx += 1;
            }

            return (
                <div>
                    <div className={tooltipStyles.time}>{dateMath.format(ts)}</div>
                    {rows}
                </div>
            );

        } else {
            return null;
        }
    }
}

export const RenderStatus = {
    SUCCESS: 0,
    NO_DATA: 1
};
export const XAxisType = {
    DATETIME: "datetime",
    NUMBER: "number",
}

export {ConfigDifference} from "./common";

function compareConfigs(conf1, conf2, customComparator) {
    let diffResult = ConfigDifference.NONE;

    function compareColor(a, b) {
        return a.r === b.r && a.g === b.g && a.b === b.b && a.opacity === b.opacity;
    }

    function compareSignal(sig1, sig2) {
        if (sig1.cid !== sig2.cid || sig1.mutate !== sig2.mutate || sig1.generate !== sig2.generate) {
            diffResult = ConfigDifference.DATA;
        } else if (!compareColor(sig1.color, sig2.color) || sig1.label !== sig2.label || sig1.enabled !== sig2.enabled) {
            diffResult = ConfigDifference.RENDER;
        }
    }


    function compareSigSet(sigSet1, sigSet2) {
        if (sigSet1.cid !== sigSet2.cid) {
            diffResult = ConfigDifference.DATA;
            return;
        }

        if (sigSet1.signals.length !== sigSet2.signals.length) {
            diffResult = ConfigDifference.DATA;
            return;
        }

        for (let idx = 0; idx < sigSet1.signals.length; idx++) {
            compareSignal(sigSet1.signals[idx], sigSet2.signals[idx]);
            if (diffResult === ConfigDifference.DATA) {
                return;
            }
        }
    }

    function compareConf(conf1, conf2) {
        if (conf1.signalSets.length !== conf2.signalSets.length) {
            diffResult = ConfigDifference.DATA;
            return;
        }

        for (let idx = 0; idx < conf1.signalSets.length; idx++) {
            compareSigSet(conf1.signalSets[idx], conf2.signalSets[idx]);
            if (diffResult === ConfigDifference.DATA) {
                return;
            }
        }

        if (customComparator) {
            const res = customComparator(conf1, conf2);
            if (res > diffResult) {
                diffResult = res;
            }
        }
    }

    compareConf(conf1, conf2);
    return diffResult;
}


@withComponentMixins([
    withTranslation,
    withErrorHandling,
    intervalAccessMixin(),
    rangeAccessMixin,
])
export class TimeBasedChartBase extends Component {
    constructor(props) {
        super(props);

        const t = props.t;

        this.dataAccessSession = new DataAccessSession();
        this.state = {
            selection: null,
            mousePosition: null,
            signalSetsData: null,
            statusMsg: t('Loading...'),
            width: 0,
            zoomTransform: d3Zoom.zoomIdentity,
            loading: true,
            brushInProgress: false,
        };
        this.zoom = null;

        this.resizeListener = () => {
            this.createChart(this.state.signalSetsData);
            this.updateTimeIntervalChartWidth();
        };

        this.delayedFetchDueToTimeIntervalChartWidthUpdate = false;

        this.plotRectId = _.uniqueId("plotRect");
    }

    static propTypes = {
        config: PropTypes.object.isRequired,
        data: PropTypes.object,
        contentComponent: PropTypes.func,
        contentRender: PropTypes.func,
        height: PropTypes.number.isRequired,
        margin: PropTypes.object.isRequired,
        withBrush: PropTypes.bool,
        drawBrushAreaBehindData: PropTypes.bool, // set to `true` if you need to use pointer (mouse) events on the drawn data. By default, the brush area is drawn on top of the data – it is not visible but it catches the events.
        withTooltip: PropTypes.bool,
        withZoom: PropTypes.bool,
        zoomUpdateReloadInterval: PropTypes.number, // milliseconds after the zoom ends; set to null to disable updates
        loadingOverlayColor: PropType_d3Color(),
        displayLoadingTextWhenUpdating: PropTypes.bool,
        tooltipContentComponent: PropTypes.func,
        tooltipContentRender: PropTypes.func,

        getSignalValuesForDefaultTooltip: PropTypes.func,
        getQueries: PropTypes.func.isRequired,
        prepareData: PropTypes.func.isRequired,
        createChart: PropTypes.func.isRequired,
        getGraphContent: PropTypes.func.isRequired,
        getSvgDefs: PropTypes.func,
        compareConfigs: PropTypes.func,
        xAxisType: PropTypes.oneOf([XAxisType.DATETIME, XAxisType.NUMBER]).isRequired, // data type on the x-axis

        tooltipExtraProps: PropTypes.object,
        getTooltipExtraState: PropTypes.func,

        minimumIntervalMs: PropTypes.number,

        controlTimeIntervalChartWidth: PropTypes.bool
    }

    static defaultProps = {
        tooltipExtraProps: {},
        minimumIntervalMs: 10000,
        getSvgDefs: () => null,
        zoomUpdateReloadInterval: 1000,
        displayLoadingTextWhenUpdating: true,
        drawBrushAreaBehindData: false,
        xAxisType: XAxisType.DATETIME,
    }

    updateTimeIntervalChartWidth() { // TODO: XAxisType.NUMBER – do we need to do anything?
        if (this.props.xAxisType === XAxisType.DATETIME) {
            const intv = this.getInterval();
            const width = this.containerNode.getClientRects()[0].width;

            if (this.props.controlTimeIntervalChartWidth && intv.conf.chartWidth !== width) {
                intv.setConf({
                    chartWidth: width
                });

                this.delayedFetchDueToTimeIntervalChartWidthUpdate = true;
            }
        }
    }

    componentDidMount() {
        window.addEventListener('resize', this.resizeListener);
        window.addEventListener('keydown', ::this.keydownListener);
        window.addEventListener('keyup', ::this.keyupListener);

        // This causes the absolute interval to change, which in turn causes a data fetch
        this.resizeListener();

        if (!this.delayedFetchDueToTimeIntervalChartWidthUpdate) {
            // noinspection JSIgnoredPromiseFromCall
            this.fetchData();
        }

        // this.createChart(this.state.signalSetsData) is not needed here because at this point, we are missing too many things to actually execute it
    }

    // If control key is held down, brush should be enabled.
    keydownListener(event) {
        if (event.key === "Control" && !this.state.brushInProgress)
            this.setState({brushInProgress: true});
    }
    keyupListener(event) {
        if (event.key === "Control" && this.state.brushInProgress && !this.state.zoomInProgress)
            this.setState({brushInProgress: false});
    }

    componentDidUpdate(prevProps, prevState) {
        let signalSetsData = this.state.signalSetsData;
        const xIsDate = this.props.xAxisType === XAxisType.DATETIME;

        const t = this.props.t;

        const configDiff = compareConfigs(prevProps.config, this.props.config, this.props.compareConfigs);

        // compare time intervals or ranges
        const absIntervalDiffers = xIsDate
            ? this.getIntervalAbsolute(prevProps) !== this.getIntervalAbsolute()
            : false;
        const specDiffers = xIsDate
            ? this.getIntervalSpec(prevProps) !== this.getIntervalSpec()
            : this.getRange(prevProps) !== this.getRange();

        if (configDiff === ConfigDifference.DATA && !this.props.data) {
            this.setState({
                signalSetsData: null
            });
            this.zoom = null;

            // noinspection JSIgnoredPromiseFromCall
            this.fetchData();
            signalSetsData = null;

        } else if (specDiffers && !this.props.data) {
            this.zoom = null;
            // noinspection JSIgnoredPromiseFromCall
            this.fetchData();
        } else if (
            this.delayedFetchDueToTimeIntervalChartWidthUpdate ||
            absIntervalDiffers ||
            this.props.data !== prevProps.data
        ) { // If its just a regular refresh, don't clear the chart
            this.delayedFetchDueToTimeIntervalChartWidthUpdate = false;

            if (!areZoomTransformsEqual(this.state.zoomTransform, d3Zoom.zoomIdentity)) // update time interval based on what is currently visible
                this.setInterval(...this.xScaleDomain);

            // noinspection JSIgnoredPromiseFromCall
            this.fetchData();

        } else {
            const forceRefresh = this.prevContainerNode !== this.containerNode
                || prevState.signalSetsData !== this.state.signalSetsData
                || configDiff !== ConfigDifference.NONE
                || absIntervalDiffers
                || prevState.brushInProgress !== this.state.brushInProgress
                || !areZoomTransformsEqual(prevState.zoomTransform, this.state.zoomTransform);

            this.createChart(signalSetsData, forceRefresh);
            this.prevContainerNode = this.containerNode;
        }
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resizeListener);
        window.removeEventListener('keydown', ::this.keydownListener);
        window.removeEventListener('keyup', ::this.keyupListener);
        clearTimeout(this.zoomUpdateReloadTimeoutID);
    }

    @withAsyncErrorHandler
    async fetchData() {
        const t = this.props.t;
        const newState = { loading: true }
        if (this.props.displayLoadingTextWhenUpdating)
            newState.statusMsg = t('Loading...');
        this.setState(newState);

        try {
            let results = null;

            if (this.props.data) {
                results = [this.props.data];
            } else {
                const interval = this.props.xAxisType === XAxisType.DATETIME
                    ? this.getIntervalAbsolute()
                    : this.getRange();
                const queries = this.props.getQueries(this, interval, this.props.config);

                results = await this.dataAccessSession.getLatestMixed(queries);
            }

            if (results) {
                // This converts NaNs and Infinity to null. D3 can handle nulls in data by omitting the data point
                for (const resultSet of results) {
                    for (const sigSetCid in resultSet) {
                        const sigSetData = resultSet[sigSetCid];

                        const processSignals = data => {
                            for (const sigCid in data) {
                                const sigData = data[sigCid];
                                for (const agg in sigData) {
                                    if (!isFinite(sigData[agg])) {
                                        sigData[agg] = null;
                                    }
                                }
                            }
                        };

                        if (sigSetData.prev) {
                            processSignals(sigSetData.prev.data);
                        }

                        if (sigSetData.main) {
                            for (const mainData of sigSetData.main) {
                                processSignals(mainData.data);
                            }
                        }

                        if (sigSetData.next) {
                            processSignals(sigSetData.next.data);
                        }
                    }
                }

                this.setState({signalSetsData: null}, () =>
                    this.setState({
                        statusMsg: "",
                        ...this.props.prepareData(this, results),
                        loading: false
                    })
                );
            }
        } catch (err) {
            if (err instanceof interoperableErrors.TooManyPointsError) {
                this.setState({
                    statusMsg: t('Too many data points.')
                });
                return;
            }
            this.setState({statusMsg: t("Error loading data.")});

            throw err;
        } finally {
            this.setState({loading: false});
        }
    }

    createChart(signalSetsData, forceRefresh) {
        const t = this.props.t;
        const self = this;
        const xIsDate = this.props.xAxisType === XAxisType.DATETIME;

        const width = this.containerNode.getClientRects()[0].width;

        if (this.state.width !== width) {
            this.setState({
                width
            });
        }

        if (!forceRefresh && width === this.renderedWidth) {
            return;
        }
        this.renderedWidth = width;
        const innerWidth = width - this.props.margin.left - this.props.margin.right;
        const innerHeight = this.props.height - this.props.margin.top - this.props.margin.bottom;

        if (!signalSetsData) {
            return;
        }

        let xScale;
        let interval;
        if (xIsDate) {
            const abs = this.getIntervalAbsolute();
            interval = abs;
            xScale = this.state.zoomTransform.rescaleX(
                d3Scale.scaleTime()
                    .domain([abs.from, abs.to])
                    .range([0, innerWidth])
            );
        } else {
            const range = this.getRange();
            interval = range;
            xScale = this.state.zoomTransform.rescaleX(
                d3Scale.scaleLinear()
                    .domain(range)
                    .range([0, innerWidth])
            );
        }
        this.xScaleDomain = xScale.domain().map(d => d.valueOf());

        const xAxis = d3Axis.axisBottom(xScale)
            .tickSizeOuter(0);
        if (this.props.xAxisTicksCount) xAxis.ticks(this.props.xAxisTicksCount);
        if (this.props.xAxisTicksFormat) xAxis.tickFormat(this.props.xAxisTicksFormat);
        this.xAxisSelection
            .call(xAxis);

        if (this.props.withBrush) {
            const brush = d3Brush.brushX()
                .extent([[0, 0], [innerWidth, innerHeight]])
                .filter(() => { // TODO what to do when withZoom == false
                    // noinspection JSUnresolvedVariable
                    return d3Event.ctrlKey && !d3Event.button; // enable brush only when ctrl is pressed, modified version of default brush filter (https://github.com/d3/d3-brush#brush_filter)
                })
                .on("end", function brushed() {
                    const sel = d3Event.selection;

                    if (sel) {
                        const selFrom = xScale.invert(sel[0]).valueOf();
                        let selTo = xScale.invert(sel[1]).valueOf();

                        self.setInterval(selFrom, selTo);

                        self.brushSelection.call(brush.move, null);
                    }
                });

            this.brushSelection
                .call(brush);

        } else {
            this.brushSelection
                .selectAll('rect')
                .remove();

            this.brushSelection.append('rect')
                .attr('pointer-events', 'all')
                .attr('cursor', 'crosshair')
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', innerWidth)
                .attr('height', innerHeight)
                .attr('visibility', 'hidden');
        }

        if (this.props.withZoom)
            this.createChartZoom();

        this.cursorLineVisible = false;
        this.cursorSelection
            .attr('y1', this.props.margin.top)
            .attr('y2', this.props.height - this.props.margin.bottom);


        const renderStatus = this.props.createChart(this, signalSetsData, this.state, interval, xScale);

        if (renderStatus === RenderStatus.NO_DATA && this.state.statusMsg === "")
            this.setState({statusMsg: t('No data.')});
    }

    setInterval(from, to) {
        if (this.props.xAxisType === XAxisType.DATETIME) {
            const intv = this.getInterval();

            if (to - from < this.props.minimumIntervalMs) {
                to = from + this.props.minimumIntervalMs;
            }

            const rounded = intv.roundToMinAggregationInterval(from, to);

            const spec = new IntervalSpec(
                rounded.from,
                rounded.to,
                null
            );

            intv.setSpec(spec);
        } else {
            this.setRange([from, to]);
        }
    }

    createChartZoom() {
        const self = this;

        const handleZoom = function () {
            // noinspection JSUnresolvedVariable
            if (d3Event.sourceEvent && d3Event.sourceEvent.type === "wheel") {
                transitionInterpolate(self.containerNodeSelection, self.state.zoomTransform, d3Event.transform, setZoomTransform(self));
            } else {
                // noinspection JSUnresolvedVariable
                self.setState({zoomTransform: d3Event.transform});
            }
        };

        const handleZoomStart = function () {
            clearTimeout(self.zoomUpdateReloadTimeoutID);
        };

        const handleZoomEnd = function () {
            // noinspection JSUnresolvedVariable
            if (self.props.zoomUpdateReloadInterval === null || self.props.zoomUpdateReloadInterval === undefined) // don't update automatically
                return;
            // noinspection JSUnresolvedVariable
            if (!Object.is(d3Event.transform, d3Zoom.zoomIdentity))
                if (self.props.zoomUpdateReloadInterval > 0) {
                    clearTimeout(self.zoomUpdateReloadTimeoutID);
                    self.zoomUpdateReloadTimeoutID = setTimeout(() => {
                        self.setInterval(...self.xScaleDomain)
                    }, self.props.zoomUpdateReloadInterval);
                } else if (self.props.zoomUpdateReloadInterval >= 0)
                    self.setInterval(...self.xScaleDomain);
        };

        const ySize = this.props.height - this.props.margin.top - this.props.margin.bottom;
        const zoomExtent = [[0, 0], [this.renderedWidth - this.props.margin.left - this.props.margin.right, ySize]];
        const translateExtent = [[-Infinity, 0], [Infinity, this.props.height - this.props.margin.top - this.props.margin.bottom]];
        const zoomExisted = this.zoom !== null;
        this.zoom = zoomExisted ? this.zoom : d3Zoom.zoom();
        this.zoom
            .translateExtent(translateExtent)
            .extent(zoomExtent)
            .on("zoom", handleZoom)
            .on("end", handleZoomEnd)
            .on("start", handleZoomStart)
            .wheelDelta(wheelDelta(3))
            .filter(() => {
                if (d3Event.type === "wheel" && !d3Event.shiftKey)
                    return false;
                return !d3Event.ctrlKey && !d3Event.button;
            });
        this.containerNodeSelection.call(this.zoom);
        if (!zoomExisted)
            this.resetZoom(); // this is called after data are reloaded
    }

    setZoom(transform) {
        if (this.props.withZoom && this.zoom)
            this.containerNodeSelection.call(this.zoom.transform, transform);
        else
            this.setState({zoomTransform: transform})
    }

    resetZoom() {
        this.setZoom(d3Zoom.zoomIdentity);
    }

    render() {
        const config = this.props.config;

        if (!this.state.signalSetsData) {
            return (
                <svg ref={node => this.containerNode = node} height={this.props.height} width="100%">
                    <text textAnchor="middle" x="50%" y="50%"
                          fontFamily="'Open Sans','Helvetica Neue',Helvetica,Arial,sans-serif" fontSize="14px"
                          fill="currentColor">
                        {this.state.statusMsg}
                    </text>
                </svg>
            );

        } else {

            let content = null;
            const contentProps = {
                selection: this.state.selection,
                mousePosition: this.state.mousePosition,
                containerHeight: this.props.height,
                containerWidth: this.state.width
            };
            if (this.props.contentComponent) {
                content = <this.props.contentComponent {...contentProps}/>;
            } else if (this.props.contentRender) {
                content = this.props.contentRender(contentProps);
            }

            const tooltipExtraProps = {...this.props.tooltipExtraProps};

            if (this.props.tooltipContentComponent) {
                tooltipExtraProps.contentComponent = this.props.tooltipContentComponent;
            } else if (this.props.tooltipContentRender) {
                tooltipExtraProps.contentRender = this.props.tooltipContentRender;
            } else {
                tooltipExtraProps.contentRender = (props) => <TooltipContent
                    getSignalValues={this.props.getSignalValuesForDefaultTooltip} {...props}/>;
            }

            let tooltipExtraState = {};
            if (this.props.getTooltipExtraState) {
                tooltipExtraState = this.props.getTooltipExtraState();
            }

            return (
                <svg id="cnt" ref={node => {
                    this.containerNode = node;
                    this.containerNodeSelection = select(node)
                }} height={this.props.height} width="100%">

                    {/* SVG definitions */}
                    {this.props.getSvgDefs(this)}
                    <defs>
                        <clipPath id={this.plotRectId}>
                            <rect x="0" y="0"
                                  width={this.state.width - this.props.margin.left - this.props.margin.right}
                                  height={this.props.height - this.props.margin.top - this.props.margin.bottom}/>
                        </clipPath>
                    </defs>

                    {/* brush (if drawn behind data) */}
                    { (this.props.drawBrushAreaBehindData && !this.state.brushInProgress) &&
                    <g ref={node => this.brushSelection = select(node)}
                       transform={`translate(${this.props.margin.left}, ${this.props.margin.top})`}/>}

                    {/* main graph content */}
                    <g transform={`translate(${this.props.margin.left}, ${this.props.margin.top})`}
                       clipPath={`url(#${this.plotRectId})`} ref={node => this.GraphContentSelection = select(node)}>
                        {(!areZoomTransformsEqual(this.state.zoomTransform, d3Zoom.zoomIdentity) || this.state.loading) &&
                            <rect className={timeBasedChartBaseStyles.loadingOverlay}
                                  style={{fill: this.props.loadingOverlayColor }}
                            />
                        }
                        {this.props.getGraphContent(this)}
                    </g>

                    {/* axes */}
                    <g ref={node => this.xAxisSelection = select(node)}
                       transform={`translate(${this.props.margin.left}, ${this.props.height - this.props.margin.bottom})`}/>
                    <g ref={node => this.yAxisSelection = select(node)}
                       transform={`translate(${this.props.margin.left}, ${this.props.margin.top})`}/>

                    {/* cursor line */}
                    <line ref={node => this.cursorSelection = select(node)} className={commonStyles.cursorLine}
                          pointerEvents="none" visibility="hidden"/>

                    {/* status message */}
                    <text textAnchor="middle" x="50%" y="50%"
                          fontFamily="'Open Sans','Helvetica Neue',Helvetica,Arial,sans-serif" fontSize="14px"
                          fill="currentColor">
                        {this.state.statusMsg}
                    </text>

                    {/* tooltip */}
                    {this.props.withTooltip && !this.state.brushInProgress &&
                    <Tooltip
                        config={this.props.config.signalSets}
                        signalSetsData={this.state.signalSetsData}
                        containerHeight={this.props.height}
                        containerWidth={this.state.width}
                        mousePosition={this.state.mousePosition}
                        selection={this.state.selection}
                        {...tooltipExtraProps}
                        {...tooltipExtraState}
                    />}

                    {content}

                    {/* brush (default) */}
                    { (!this.props.drawBrushAreaBehindData || this.state.brushInProgress) &&
                    <g ref={node => this.brushSelection = select(node)}
                       transform={`translate(${this.props.margin.left}, ${this.props.margin.top})`}/>}
                </svg>
            );
        }
    }
}
