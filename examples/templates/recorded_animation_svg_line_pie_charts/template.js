'use strict';

import React, {Component} from 'react';
import moment from 'moment';
import {select, event} from 'd3-selection';
import {scaleTime, scaleLinear} from 'd3-scale';
import {zoom} from 'd3-zoom';
import {extent} from 'd3-array';
import {
    AnimationStatusContext,
    RecordedAnimation,
    OnelineLayout,
    animated,
    LineChart,
    StaticPieChart,
    LegendPosition,
    withPanelConfig,
    linearInterpolation,
    cubicInterpolation,
    TimeRangeSelector,
    SVG,
    IntervalSpec,
} from 'ivis';
import PropTypes from 'prop-types';

import styles from './styles.scss';

const PIE_CHART_DATA_SOURCE_KEY = 'piechart_dt';
const LINE_CHART_DATA_SOURCE_KEY = 'linechart_dt';
const SVG_CHART_DATA_SOURCE_KEY = 'svgchart_dt';

const SVG_CHART_HISTORY = 1000*60*60*24*100;

class SVGChart extends Component {
    static propTypes = {
        config: PropTypes.object,
        data: PropTypes.object,
        height: PropTypes.number,
        position: PropTypes.number,
        xExtents: PropTypes.arrayOf(PropTypes.number),
    }

    constructor(props) {
        super(props);

        this.noData = true;
        this.boundUpdateDots = ::this.updateDots;
        this.resizeListener = ::this.updateContainerWidth;
        this.svgImg = `
        <svg
            id="svg"
            xmlns="http://www.w3.org/2000/svg"
            font-family="sans-serif">

            <g id="content">
                <g id="grid">
                    <g id="horizontal"/>
                    <g id="vertical"/>
                </g>
                <g id="dots"></g>
            </g>
            <g id="legend" x="0" y="0"/>
            <text id="message" fill="black" x="50%" y="50%" />
        </svg>`;

        this.state = {
            width: null,
        };
    }

    updateContainerWidth() {
        const rect = this.containerNode.getClientRects()[0];

        this.setState({
            width: rect.width,
        });
    }

    componentDidMount() {
        this.resizeListener();
        window.addEventListener('resize', this.resizeListener);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resizeListener);
    }

    updateDots(dotsSel) {
        const messageSel = this.svgSel.select('#message');
        const gridSel = this.svgSel.select('#grid');
        const legendSel = this.svgSel.select('#legend');

        const conf = this.props.config;
        const data = this.props.data;

        const width = this.state.width;
        const height = this.props.height;

        const getCoordsFromLineConf = (lineConf) => (
            data[lineConf.sigSetCid]
                .map(kf => ({
                    x: kf.ts,
                    y: kf.data[lineConf.signalCid][lineConf.agg]
                })).filter(({x, y}) => x !== null && y !== null)
        );

        const xExtents = [
            this.props.position - this.props.xExtents[0],
            this.props.position + this.props.xExtents[1],
        ];

        let yExtents = [];
        for (const lineConf of conf.lines) {
            yExtents = extent([
                ...yExtents,
                ...getCoordsFromLineConf(lineConf).map(c => c.y)
            ]);
        }

        if (yExtents.every(v => v === undefined)) {
            messageSel.text('No data.');
            yExtents = [0, 1];
        } else {
            messageSel.text(null);
        }

        const yExtremesSpan = yExtents[1] - yExtents[0];
        const xExtremesSpan = xExtents[1] - xExtents[0];

        const y = scaleLinear()
            .domain([
                yExtents[0] - 0.5*yExtremesSpan,
                yExtents[1] + 0.5*yExtremesSpan
            ])
            .range([height, 0]);

        const x = scaleTime()
            .domain([
                xExtents[0] - 0.5*xExtremesSpan,
                xExtents[1] + 0.5*xExtremesSpan
            ])
            .range([0, width]);

        gridSel.select('#vertical')
            .selectAll('line')
            .data(x.ticks())
            .join('line')
            .attr('y2', height)
            .attr('stroke-width', 0.5)
            .attr('stroke', 'black')
            .attr('x1', d => x(d))
            .attr('x2', d => x(d))
            .attr('opacity', 0.2);

        gridSel.select('#horizontal')
            .selectAll('line')
            .data(y.ticks())
            .join('line')
            .attr('x2', width)
            .attr('stroke-width', 0.5)
            .attr('stroke', 'black')
            .attr('y1', d => y(d))
            .attr('y2', d => y(d))
            .attr('opacity', 0.2);


        legendSel.selectAll('text')
            .data(conf.lines)
            .join('text')
            .attr('dominant-baseline', 'hanging')
            .attr('font-weight', 'bold')
            .attr('y', (d, idx) => idx*1.2 + 'em')
            .attr('fill', d => d.color)
            .text(d => d.label);

        dotsSel.selectAll('.line')
            .data(conf.lines)
            .join(enter => enter.append('g').classed('line', true))
            .attr('color', d => d.color)
            .call(sel => sel.selectAll('circle')
                .data(d => getCoordsFromLineConf(d))
                .join('circle')
                .attr('fill', 'currentColor')
                .attr('r', 2)
                .attr('cx', d => x(d.x))
                .attr('cy', d => y(d.y))
            )
    }

    render() {
        return (
            <div
                className={this.props.className}
                ref={node => this.containerNode = node}>

                {this.state.width &&
                    <SVG
                        width={this.state.width + "px"}
                        height={this.props.height + "px"}
                        source={this.svgImg}
                        init={(node) => {
                            this.svgSel = select(node);
                            const dotsSel = this.svgSel.select('#dots');

                            this.svgSel.call(
                                zoom().extent([
                                    [0, 0],
                                    [this.state.width, this.props.height]
                                ])
                                .translateExtent([
                                    [
                                        -0.5*this.state.width,
                                        -0.5*this.props.height
                                    ],
                                    [
                                        1.5*this.state.width,
                                        1.5*this.props.height
                                    ]
                                ])
                                .scaleExtent([0.9, 10])
                                .on('zoom', () => {
                                    this.svgSel.select('#content')
                                        .attr("transform", event.transform);
                                })
                            );
                        }}
                        data={{
                            dots: this.boundUpdateDots,
                        }}
                    />
                }
            </div>
        );
    }
}

const AnimatedLineChart = animated(LineChart);
const AnimatedPieChart = animated(StaticPieChart);
const AnimatedSVGChart = animated(SVGChart);


class LineChartSection extends Component {
    static propTypes = {
        config: PropTypes.object.isRequired,
    }

    render() {
        const config = {
            yAxes: [{visible: true, belowMin: 0.1, aboveMax: 0.2}],
            signalSets: this.props.config.sigSets
        };


        return (
            <div className="container-fluid">
                <AnimatedLineChart
                    dataSourceKey={LINE_CHART_DATA_SOURCE_KEY}
                    config={config}
                    height={500}
                    withZoom={false}
                />
            </div>
        );
    }
}

class PieChartsSection extends Component {
    static propTypes = {
        sectors: PropTypes.array.isRequired,
        dataSets: PropTypes.array.isRequired,
    }

    getPieChartsProps() {
        const colors = {};
        const labels = {};
        for (const secConf of this.props.sectors) {
            colors[secConf.id] = secConf.color;
            labels[secConf.id] = secConf.label;
        }

        const pieChartProps = [];
        for (const dtSet of this.props.dataSets) {
            const arcs = [];
            for(const sector of dtSet.sectors) {
                arcs.push({
                    color: colors[sector.sectorId],
                    label: labels[sector.sectorId],
                    value: {
                        sigSetCid: dtSet.sigSetCid,
                        signalCid: sector.cid,
                        agg: 'avg'
                    }
                });
            }

            const props = {
                key: dtSet.sigSetCid,
                label: dtSet.name,
                arcs,
            };
            pieChartProps.push(props);
        }

        return pieChartProps;
    }

    render() {
        const pieChartsProps = this.getPieChartsProps();
        return (
            <div className="container-fluid">
                <div className="row">
                    {pieChartsProps.map(props =>
                        <SinglePieChartSection {...props} />
                    )}
                </div>
            </div>
        );
    }
}
class SinglePieChartSection extends Component {
    static propTypes = {
        label: PropTypes.string,
        arcs: PropTypes.array,
    }

    render() {
        return (
            <div className="col-6">
                <h4 className="text-center">{this.props.label}</h4>
                <AnimatedPieChart
                    dataSourceKey={PIE_CHART_DATA_SOURCE_KEY}
                    config={{arcs: this.props.arcs}}
                    height={150}
                    legendPosition={LegendPosition.BOTTOM}
                    legendRowClass={"col " + styles.pieChartLegend}
                />
            </div>
        );
    }
}

class SVGChartSection extends Component {
    static propTypes = {
        sigSets: PropTypes.array.isRequired,
    }

    getLines() {
        const lines = [];
        for (const sigSet of this.props.sigSets) {
            for (const signal of sigSet.signals) {
                lines.push({
                    color: signal.color,
                    label: signal.label,
                    sigSetCid: sigSet.cid,
                    signalCid: signal.cid,
                    agg: 'avg',
                });
            }
        }

        return lines;
    }

    render() {
        return (
            <AnimationStatusContext.Consumer>
                {animationStatus =>
                    <AnimatedSVGChart
                        dataSourceKey={SVG_CHART_DATA_SOURCE_KEY}
                        config={{lines: this.getLines()}}
                        height={500}
                        position={animationStatus.position}
                        xExtents={[SVG_CHART_HISTORY, SVG_CHART_HISTORY/10]}
                    />
                }
            </AnimationStatusContext.Consumer>
        );
    }
}

@withPanelConfig
export default class Panel extends Component {
    getAnimationConfig() {
        const c = this.getPanelConfig(['animationConfig']);
        const dataSources = {};

        const pieChartDtSets = this.getPanelConfig(['pieChart', 'dataSets']);
        dataSources[PIE_CHART_DATA_SOURCE_KEY] = {
            type: 'generic',
            interpolation: cubicInterpolation,

            sigSets: pieChartDtSets.map(dtSet => ({
                cid: dtSet.sigSetCid,
                tsSigCid: dtSet.tsSigCid,
                signals: dtSet.sectors,
            })),
        };

        const lineChartSigSets = this.getPanelConfig(
            ['lineChart', 'sigSets']
        );

        dataSources[LINE_CHART_DATA_SOURCE_KEY] = {
            type: 'timeSeries',
            interpolation: linearInterpolation,

            signalAggs: ['min', 'max', 'avg'],
            sigSets: lineChartSigSets,
        };

        const svgChartSigSets = this.getPanelConfig(['svgChart', 'sigSets']);
        dataSources[SVG_CHART_DATA_SOURCE_KEY] = {
            type: 'generic',
            history: SVG_CHART_HISTORY,
            interpolation: cubicInterpolation,

            sigSets: svgChartSigSets,
        };

        const initialIntervalSpec = c.timeDomain.from && c.timeDomain.to ?
            new IntervalSpec(c.timeDomain.from, c.timeDomain.to, null, null):
            undefined;

        const initialStatus = c.initialStatus && {
            isPlaying: !!c.initialStatus.isPlaying,
            position: c.initialStatus.positionISO &&
                moment.utc(c.initialStatus.positionISO).valueOf(),
            playbackSpeedFactor: c.initialStatus.playbackSpeedFactor,
        };

        return { initialStatus, dataSources, initialIntervalSpec };
    }

    getControlsConfig() {
        const config = this.getPanelConfig(['animationConfig', 'controls']);

        if (config.timeline.positionFormatString.length === 0) {
            config.timeline.positionFormatString = undefined;
        }

        const changeSpeedSteps = config.changeSpeed.steps;
        if (changeSpeedSteps.length === 0) {
            config.changeSpeed.steps = undefined;
        } else {
            config.changeSpeed.steps = changeSpeedSteps.map(
                step => step.step
            );
        }

        if (Number.isNaN(config.jumpForward.jumpFactor))
            config.jumpForward.jumpFactor = undefined;
        if (Number.isNaN(config.jumpBackward.jumpFactor))
            config.jumpBackward.jumpFactor = undefined;

        return config
    }

    render() {
        const sectors = this.getPanelConfig(['pieChart', 'sectors']);

        return (
            <RecordedAnimation {...this.getAnimationConfig()}>
                <TimeRangeSelector />
                <OnelineLayout {...this.getControlsConfig()} />

                <LineChartSection
                    config={this.getPanelConfig(['lineChart'])}
                />
                <hr />
                <PieChartsSection
                    sectors={sectors}
                    dataSets={this.getPanelConfig(['pieChart', 'dataSets'])}
                />
                <hr />
                <SVGChartSection
                    sigSets={this.getPanelConfig(['svgChart', 'sigSets'])}
                />
            </RecordedAnimation>
        );
    }
}
