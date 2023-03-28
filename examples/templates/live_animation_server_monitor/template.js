'use strict';

import React, {Component} from 'react';
import moment from "moment";
import {select, event} from "d3-selection";
import {scaleTime, scaleLinear} from "d3-scale";
import {zoom} from "d3-zoom";
import {extent} from "d3-array";
import {
    AnimationStatusContext,
    LiveAnimation,
    animated,
    withPanelConfig,
    SimpleBarChart,
    LineChart,
    OnelineLayout,
    linearInterpolation,
    cubicInterpolation,
    SVG,
} from "ivis";
import PropTypes from "prop-types";

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
const AnimatedBarChart = animated(SimpleBarChart);
const AnimatedSVGChart = animated(SVGChart);

const SVG_HISTORY = 1000*60;

const dtSrces = {
    lineChart_cpu: {
        type: 'timeSeries',
        sigSets: [{
            cid: 'cpu_load',
            signalCids: ['current', 'user', 'system']
        }],

        signalAggs: ['avg'],
        interpolation: linearInterpolation,
    },
    barChart_mem: {
        type: 'generic',
        sigSets: [{
            cid: 'mem_status',
            signalCids: ['free', 'used', 'total']
        }],
        signalAggs: ['avg'],

        interpolation: linearInterpolation,
    },
    svg_disk: {
        type: 'generic',
        history: SVG_HISTORY,
        sigSets: [{
            cid: 'disk_load',
            signalCids: ['readIOPerSec', 'writeIOPerSec', 'totalIOPerSec'],
        }],
        signalAggs: ['avg'],
        interpolation: cubicInterpolation,
    }
};

class Frame extends Component {
    static propTypes = {
        name: PropTypes.string,
    }

    render() {
        return (
            <div
                className="container-fluid border border-dark my-1 p-1 pb-4"
            >

                <h4 className="text-center text-dark">{this.props.name}</h4>
                <div className="container-fluid">
                    {this.props.children}
                </div>
            </div>
        )
    }
}

class CPU extends Component {
    static propTypes = {
        currentLoadColor: PropTypes.object.isRequired,
        userLoadColor: PropTypes.object.isRequired,
        systemLoadColor: PropTypes.object.isRequired,
    }

    render() {
        const cpuDtSrc = dtSrces.lineChart_cpu;

        const config = {
            yAxes: [{visible: true, belowMin: 0.1, aboveMax: 0.1}],
            signalSets: [
                {
                    cid: cpuDtSrc.sigSets[0].cid,
                    signals: [
                        {
                            label: 'Current load',
                            color: this.props.currentLoadColor,
                            cid: cpuDtSrc.sigSets[0].signalCids[0],
                        },
                        {
                            label: 'User load',
                            color: this.props.userLoadColor,
                            cid: cpuDtSrc.sigSets[0].signalCids[1],
                        },
                        {
                            label: 'System load',
                            color: this.props.systemLoadColor,
                            cid: cpuDtSrc.sigSets[0].signalCids[1],
                        }
                    ]
                }
            ]
        };

        return (
            <Frame name={"CPU load"}>
                <AnimatedLineChart
                    dataSourceKey={'lineChart_cpu'}
                    config={config}
                    height={300}
                    withBrush={false}
                    withZoom={false}
                />
            </Frame>
        );
    }
}
class Memory extends Component {
    static propTypes = {
        usedMemoryColor: PropTypes.object,
        freeMemoryColor: PropTypes.object,
        totalMemoryColor: PropTypes.object,
    }

    render() {
        const memDtSrc = dtSrces.barChart_mem;

        const config = {
            yAxis: {
                aboveMax: 0.2,
                includeMin: 0,
            },
            groups: [
                {
                    label: 'Free',
                    colors: [this.props.freeMemoryColor],
                    values: [
                        {
                            sigSetCid: memDtSrc.sigSets[0].cid,
                            signalCid: memDtSrc.sigSets[0].signalCids[0],
                            agg: 'avg',
                        }
                    ]
                },
                {
                    label: 'Used',
                    colors: [this.props.usedMemoryColor],
                    values: [
                        {
                            sigSetCid: memDtSrc.sigSets[0].cid,
                            signalCid: memDtSrc.sigSets[0].signalCids[1],
                            agg: 'avg',
                        }
                    ]
                },
                {
                    label: 'Total',
                    colors: [this.props.totalMemoryColor],
                    values: [
                        {
                            sigSetCid: memDtSrc.sigSets[0].cid,
                            signalCid: memDtSrc.sigSets[0].signalCids[2],
                            agg: 'avg',
                        }
                    ]
                },
            ]
        };

        return (
            <Frame name={"Memory"}>
                <AnimatedBarChart
                    dataSourceKey={'barChart_mem'}
                    config={config}
                    height={150}
                    groupPadding={0.001}
                    codomainLabel="In bytes"
                    valueFormatSpecifier=".2~s"
                    isHorizontal
                    withTickLines
                    withBarValues
                />
            </Frame>
        );
    }
}
class Disk extends Component {
    static propTypes = {
        diskReadColor: PropTypes.object,
        diskWriteColor: PropTypes.object,
        diskTotalColor: PropTypes.object,
    }

    render() {
        const diskDtSrc = dtSrces.svg_disk;

        const config = {
            lines: [
                {
                    color: this.props.diskReadColor,
                    label: 'Read IO operations per sec.',
                    sigSetCid: diskDtSrc.sigSets[0].cid,
                    signalCid: diskDtSrc.sigSets[0].signalCids[0],
                    agg: 'avg',
                },
                {
                    color: this.props.diskWriteColor,
                    label: 'Write IO operations per sec.',
                    sigSetCid: diskDtSrc.sigSets[0].cid,
                    signalCid: diskDtSrc.sigSets[0].signalCids[1],
                    agg: 'avg',
                },
                {
                    color: this.props.diskTotalColor,
                    label: 'Total IO operations per sec.',
                    sigSetCid: diskDtSrc.sigSets[0].cid,
                    signalCid: diskDtSrc.sigSets[0].signalCids[2],
                    agg: 'avg',
                }
            ]
        };

        return (
            <Frame name={"Disk load"}>
                <AnimationStatusContext.Consumer>
                    {animationStatus =>
                        <AnimatedSVGChart
                            dataSourceKey={'svg_disk'}
                            height={300}
                            config={config}
                            position={animationStatus.position}
                            xExtents={[SVG_HISTORY, SVG_HISTORY/10]}
                        />
                    }
                </AnimationStatusContext.Consumer>
            </Frame>
        );
    }
}

@withPanelConfig
export default class Panel extends Component {
    getAnimationConfig() {
        const c = this.getPanelConfig(['animation']);
        return {
            pollRate: c.pollRate,
            initialStatus: {
                isPlaying: c.isPlaying,
            },
            dataSources: dtSrces,
            animationId: 'monitor',
            intervalSpanAfter: moment.duration(c.intervalSpanAfter),
            intervalSpanBefore: moment.duration(c.intervalSpanBefore),
        };
    }

    render() {
        const timelineConf = this.getPanelConfig(['animation', 'timeline']);
        const playPauseConf = this.getPanelConfig(['animation', 'playPause']);

        if (timelineConf.positionFormatString === "")
            timelineConf.positionFormatString = undefined;

        const cpuColors = {
            currentLoadColor: this.getPanelConfig(['currentLoadColor']),
            userLoadColor: this.getPanelConfig(['userLoadColor']),
            systemLoadColor: this.getPanelConfig(['systemLoadColor']),
        };

        const memoryColors = {
            usedMemoryColor: this.getPanelConfig(['usedMemoryColor']),
            freeMemoryColor: this.getPanelConfig(['freeMemoryColor']),
            totalMemoryColor: this.getPanelConfig(['totalMemoryColor']),
        };

        const diskColors = {
            diskReadColor: this.getPanelConfig(['diskReadColor']),
            diskWriteColor: this.getPanelConfig(['diskWriteColor']),
            diskTotalColor: this.getPanelConfig(['diskTotalColor']),
        };

        return (
            <LiveAnimation {...this.getAnimationConfig()}>
                <OnelineLayout
                    playPause={playPauseConf}
                    timeline={timelineConf}
                />

                <CPU {...cpuColors} />
                <Memory {...memoryColors} />
                <Disk {...diskColors} />
            </LiveAnimation>
        );
    }
}
