"use strict";

import React, {Component, useState, useEffect, useRef} from "react";
import PropTypes from "prop-types";
import {SVG} from "../ivis/SVG";
import {select, mouse, local} from "d3-selection";
import {scaleTime, scaleLinear} from "d3-scale";
import {timeFormat} from "d3-time-format";
import {scan} from "d3-array";
import {AnimationStatusContext, AnimationControlContext} from "../ivis/ServerAnimationContext";
import styles from "./media-controls.scss";
import {withComponentMixins, createComponentMixin} from "./decorator-helpers";

const withAnimationControl = createComponentMixin({
    contexts: [
        {context: AnimationStatusContext, propName: 'animStatus'},
        {context: AnimationControlContext, propName: 'animControl'}
    ]
});

//Should not be a problem that rerender of MediaButton will force update
//underlying SVG. In case of needed performence boost use React.memo
function MediaButton(props) {
    //TODO: There is need to touch the div in SVG cuz of styling... Or just give
    //the div "media-button-wrapper" class and thats it...
    const isDisabled = !props.onClick;
    const color = isDisabled ? "grey" : "black";
    const accColor = '#20a8d8';

    const baseButton = `<svg class="${styles["media-button"]}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <clipPath id="border-left-half">
                    <rect
                        x="0"
                        y="0"
                        width="50"
                        height="100" />
                </clipPath>
                <clipPath id="border-right-half">
                    <rect
                        x="50"
                        y="0"
                        width="50"
                        height="100"/>
                </clipPath>
            </defs>

            <g id="border" style="cursor: ${isDisabled ? 'not-allowed' : 'pointer'}"; color="white">
                <rect
                    ${props.isJoinedLeft ? 'x="0" width="100"' : 'x="2" rx="10" width="96"'}
                    y="2"
                    height="96"
                    fill="currentColor"
                    stroke-width="4"
                    stroke=${color}
                    clip-path="url(#border-left-half)" />

                <rect
                    ${props.isJoinedRight ? 'x="0" width="100"' : 'x="2" rx="10" width="96"'}
                    y="2"
                    height="96"
                    fill="currentColor"
                    stroke=${color}
                    stroke-width="4"
                    clip-path="url(#border-right-half)" />
            </g>
            ${props.innerSvg}
        </svg>`;

    return (
        <SVG
            width={props.width}
            height={props.height}
            source={baseButton}
            init={node => {
                const innerSVG = select(node).select("#innerSvg");
                const border = select(node).select("#border");

                select(node.parentNode).
                    classed("media-button-wrapper", true);

                innerSVG.
                    attr('width', 70).
                    attr('height', 70).
                    attr('x', 15).
                    attr('y', 15).
                    attr('color', color).
                    attr('pointer-events', 'none');

                if (!isDisabled) {
                    border.
                        on('click', () => props.onClick(node)).
                        on('mouseenter', () => border.attr('color', accColor)).
                        on('mouseleave', () => border.attr('color', 'white'));
                }
            }}
        />
    );
}
MediaButton.propTypes = {
    height: PropTypes.string,
    width: PropTypes.string,
    isJoinedLeft: PropTypes.bool,
    isJoinedRight: PropTypes.bool,
    innerSvg: PropTypes.string,
    onClick: PropTypes.func,
};

@withComponentMixins([
    withAnimationControl
])
class PlayPauseButton extends Component {
    static propTypes = {
        height: PropTypes.string,
        width: PropTypes.string,
        isJoinedLeft: PropTypes.bool,
        isJoinedRight: PropTypes.bool,
        animStatus: PropTypes.object,
        animControl: PropTypes.object,
    }
    constructor(props) {
        super(props);

        this.playButt = `<svg
                id="innerSvg"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg">

                <polygon points="26,18 80,50 26,82" stroke-width="10" stroke-linejoin="round"
                    fill="currentColor"
                    stroke="currentColor"
                />
            </svg>`;
        this.pauseButt = `<svg
                id="innerSvg"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg">

                <g>
                    <rect width="30" height="76" fill="currentColor" rx="10"
                        x="15" y="12"
                    />

                    <rect width="30" height="76" fill="currentColor" rx="10"
                        x="55" y="12"
                    />
                </g>
            </svg>`;
    }

    onPress() {
        if (this.props.animStatus.isPlaying || this.props.animStatus.isBuffering)
            this.props.animControl.pause();
        else
            this.props.animControl.play();
    }

    render() {
        const innerSvg = this.props.animStatus.isPlaying || this.props.animStatus.isBuffering ? this.pauseButt : this.playButt;

        return (
            <MediaButton
                height={this.props.height}
                width={this.props.width}
                isJoinedLeft={this.props.isJoinedLeft}
                isJoinedRight={this.props.isJoinedRight}
                innerSvg={innerSvg}
                onClick={this.props.animControl.play && this.props.animControl.pause && ::this.onPress}
            />
        );
    }
}

@withComponentMixins([
    withAnimationControl
])
class StopButton extends Component {
    static propTypes = {
        height: PropTypes.string,
        width: PropTypes.string,
        isJoinedLeft: PropTypes.bool,
        isJoinedRight: PropTypes.bool,
        animStatus: PropTypes.object,
        animControl: PropTypes.object,
    }

    constructor(props) {
        super(props);
        this.button = `<svg
                id="innerSvg"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg">

            <rect width="70" height="70" x="15" y="15" rx="10" fill="currentColor"/>
        </svg>`;
    }

    render() {
        return (
            <MediaButton
                height={this.props.height}
                width={this.props.width}
                isJoinedLeft={this.props.isJoinedLeft}
                isJoinedRight={this.props.isJoinedRight}
                innerSvg={this.button}
                onClick={this.props.animControl.stop}/>
        );
    }
}

@withComponentMixins([
    withAnimationControl
])
class JumpForwardButton extends Component {
    static propTypes = {
        height: PropTypes.string,
        width: PropTypes.string,
        isJoinedLeft: PropTypes.bool,
        isJoinedRight: PropTypes.bool,
        animStatus: PropTypes.object,
        animControl: PropTypes.object,
        jump: PropTypes.number,
    }

    constructor(props) {
        super(props);
        this.button = `<svg
                id="innerSvg"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg">

            <polygon points="26,20 70,50 26,80" stroke-width="20" stroke-linejoin="round"
                fill="currentColor"
                stroke="currentColor"
            />
            <rect width="20" height="80" y="10" x="65" rx="10" fill="currentColor" />
        </svg>`;
    }

    render() {
        return (
            <MediaButton
                height={this.props.height}
                width={this.props.width}
                isJoinedLeft={this.props.isJoinedLeft}
                isJoinedRight={this.props.isJoinedRight}
                innerSvg={this.button}
                onClick={() => this.props.animControl.jumpForward(this.props.jump)}/>
        );
    }
}

@withComponentMixins([
    withAnimationControl
])
class JumpBackwardButton extends Component {
    static propTypes = {
        height: PropTypes.string,
        width: PropTypes.string,
        isJoinedLeft: PropTypes.bool,
        isJoinedRight: PropTypes.bool,
        animStatus: PropTypes.object,
        animControl: PropTypes.object,
        jump: PropTypes.number,
    }

    constructor(props) {
        super(props);
        this.button = `<svg
                id="innerSvg"
                viewBox="0 0 100 100"
                xmlns="http://www.w3.org/2000/svg">

            <rect width="20" height="80" y="10" x="15" rx="10" fill="currentColor" />
            <polygon points="74,20 30,50 74,80" stroke-width="20" stroke-linejoin="round"
                fill="currentColor"
                stroke="currentColor"
            />
        </svg>`;
    }

    render() {
        return (
            <MediaButton
                height={this.props.height}
                width={this.props.width}
                isJoinedLeft={this.props.isJoinedLeft}
                isJoinedRight={this.props.isJoinedRight}
                innerSvg={this.button}
                onClick={() => this.props.animControl.jumpBackward(this.props.jump)}/>
        );
    }
}

@withComponentMixins([
    withAnimationControl
])
class PlaybackSpeedSlider extends Component {
    static propTypes = {
        maxFactor: PropTypes.number,
        minFactor: PropTypes.number,
        animControl: PropTypes.object,
        animStatus: PropTypes.object,
    }

    constructor(props) {
        super(props);

        this.state = {
            nodes: {},
            enabled: false,
        };

        this.minPos = 10;
        this.maxPos = 115;
    }

    componentDidUpdate(prevProps) {
        if (prevProps.minFactor !== this.props.minFactor || prevProps.maxFactor !== this.props.maxFactor) {
            this.setState({scale: this.generateScale()});
        }

        if (prevProps.animControl.changeSpeed !== this.props.animControl.changeSpeed) {
            this.setState({enabled: !!this.props.animControl.changeSpeed});
        }
    }

    componentDidMount() {
        this.init();
    }

    init() {
        // TODO: extra enable and extra disable props on SliderBase
        // const pointerSel = select(this.pointerN);
        // pointerSel
        //     .on("mouseenter", () => pointerSel.attr("fill", "yellow"))
        //     .on("mouseleave", () => pointerSel.attr("fill", "white"));

        this.setState({
            nodes: {
                slider: select(this.sliderN),
                scale: select(this.scaleN),
                pointer: select(this.pointerN),
                label: select(this.labelN)
            },
            enabled: !!this.props.animControl.changeSpeed,
            scale: this.generateScale(),
        });
    }

    generateScale() {
        return scaleLinear()
            .domain([this.props.minFactor, this.props.maxFactor])
            .range([this.minPos, this.maxPos])
            .clamp(true);
    }

    render() {
        return (
            <>
                <SliderBase
                    nodes={this.state.nodes}

                    enabled={this.state.enabled}

                    valueToPos={this.state.scale}
                    posToValue={this.state.scale && this.state.scale.invert}

                    value={this.props.animStatus.speedFactor && this.props.animStatus.speedFactor}
                    setValue={value => this.props.animControl.changeSpeed(value)}
                    printValue={value => value.toFixed(2) + "x"}
                    snapToValue={value => Math.round(value/0.25) * 0.25}
                    movePointer={(pointer, pos) => pointer.attr("x", pos)}
                />

                <svg viewBox="0 0 125 50" xmlns="http://www.w3.org/2000/svg" color="black" ref={node => this.sliderN = node}>
                    <defs>
                        <circle id="circle"
                            cy="40" r="6" cx="0" stroke="currentColor" strokeWidth="2"/>
                    </defs>
                    <line id="scale"
                        x1="10" y1="40" x2="115" y2="40"
                        stroke="currentColor" strokeWidth="5" strokeLinecap="round"
                        ref={node => this.scaleN = node}/>
                    <text id="label"
                        textAnchor="middle" fill="currentColor"
                        x="50%" y="20" ref={node => this.labelN = node}/>
                    <use id="pointer" x={this.minPos} href="#circle" fill="white" ref={(node) => this.pointerN = node}/>
                </svg>

            </>
        );
    }
}

const durationBaseIntervals = {
    millisecond: 1,
    second:      1000,
    minute:      1000*60,
    hour:        1000*60*60,
    day:         1000*60*60*24,
    month:       1000*60*60*24*30,
    year:        1000*60*60*24*30*12,
};

function generateTimeUnitsUsedInLabel(maxTimeDiff, precision, delim) {
    const unitNames = ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'];
    const units = unitNames.map(key => durationBaseIntervals[key]);

    let i = 0;
    while (i < units.length && maxTimeDiff < units[i]) i++;

    let usedUnits = unitNames[i];

    i++;
    while (i < units.length && precision < units[i]) {
        usedUnits += delim + unitNames[i];
        i++;
    }

    if (usedUnits.indexOf(delim) >= 0 && i < units.length) {
        usedUnits += delim + unitNames[i];
    }

    return usedUnits;
}

function generateTimestampLabelFormat(maxTimeDiff, precision) {
    const replace = (match, replacement) => {return (str) => str.replace(match, replacement);};

    const delim = ';';
    const usedUnits = generateTimeUnitsUsedInLabel(maxTimeDiff, precision, delim);

    //Order matters, longest matches at the top
    const grammarRules = [
        replace('hour;minute;second;millisecond', '%H:%M:%S.%L'),
        replace('year;month;day', '%Y/%m/%d/'),
        replace('hour;minute;second', '%H:%M:%S'),
        replace('month;day', '%b %d, '),
        replace('second;millisecond', '%S.%Ls'),
        replace('year', '%Y'),
        replace('month', '%b'),
        replace('day', '%a %d'),
        replace('hour', '%Hh'),
        replace('minute', '%Mm'),
        replace('millisecond', '0.%Ls'),
        replace('second', '%Ss'),
    ];

    const formatStr = grammarRules.reduce((str, func) => func(str), usedUnits).replace(new RegExp(delim, 'g'), '\u00A0');
    return timeFormat(formatStr);
}

function generateDurationLabelFormat(durLenght, precision) {
    const usedUnits = generateTimeUnitsUsedInLabel(durLenght, precision, ',').split(',');

    const suffixes = {
        millisecond: 'ms',
        second: 's',
        minute: 'min',
        hour: 'h',
        day: 'd',
        month: 'mo',
        year: 'y',
    };

    const toDoubleDigits = (count) => count < 10 ? "0" + count : "" + count;

    const formatCount = {
        millisecond: toDoubleDigits,
        second: toDoubleDigits,
        minute: toDoubleDigits,
        hour: toDoubleDigits,
        day: toDoubleDigits,
        month: toDoubleDigits,
        year: (count) => "" + count,
    };

    const format = (ts) => {
        let str = "";
        let leftOverMs = ts;
        for (let i = 0; i < usedUnits.length; i++) {
            const unitName = usedUnits[i];
            const unitDuration = durationBaseIntervals[unitName];

            const count = Math.floor(leftOverMs / unitDuration);
            leftOverMs -= count * unitDuration;

            str += formatCount[unitName](count) + suffixes[unitName] + " ";
        }

        return str.substring(0, str.length - 1);
    };

    return format;
}

class Timeline extends Component {
    static propTypes = {
        //TODO
        relative: PropTypes.bool,
        beginTs: PropTypes.number,
        endTs: PropTypes.number,
        ticks: PropTypes.object,

        margin: PropTypes.object,

        length: PropTypes.number,
        position: PropTypes.number,
        id: PropTypes.number,
    }

    static defaultProps = {
        beginTs: 0,
    }

    constructor(props) {
        super(props);

        this.state = {
            //TODO
            enabled: false,
            axis: null,
        };

        this.labelRefreshRate = 500;
        this.defaultTickCount = 50;

        this.durationIntervals = [
            1, 10, 50, 250, 500,

            durationBaseIntervals.second,
            5*durationBaseIntervals.second,
            15*durationBaseIntervals.seconds,
            30*durationBaseIntervals.second,

            durationBaseIntervals.minute,
            5*durationBaseIntervals.minute,
            15*durationBaseIntervals.minute,
            30*durationBaseIntervals.minute,

            durationBaseIntervals.hour,
            3*durationBaseIntervals.hour,
            6*durationBaseIntervals.hour,
            12*durationBaseIntervals.hour,

            durationBaseIntervals.day,
            5*durationBaseIntervals.day,
            15*durationBaseIntervals.day,

            durationBaseIntervals.month,
            3*durationBaseIntervals.month,

            durationBaseIntervals.year,
        ];
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.relative !== prevProps.relative || this.props.beginTs !== prevProps.beginTs ||
            this.props.length !== prevProps.length || this.props.endTs !== this.props.endTs ||
            this.props.ticks !== prevProps.ticks || this.props.margin !== prevProps.margin) {
            this.init();
        }

        if (prevState.scaleDef !== this.state.scaleDef) {
            this.axisInit();
        }
    }

    componentDidMount() {
        window.addEventListener("resize", ::this.init);
        this.init();
    }

    componentWillUnmount() {
        window.removeEventListener("resize", ::this.init);
    }

    getPointerLabelFormat() {
        const minTimeStep = (this.labelRefreshRate / this.props.length) * (this.props.endTs - this.props.beginTs);

        if (this.props.relative) {
            return generateDurationLabelFormat(this.props.endTs, minTimeStep);
        } else {
            return generateTimestampLabelFormat(this.props.endTs - this.props.beginTs, minTimeStep);
        }
    }


    getDefaultRelativeTicks(scale) {
        const scaleDomain = scale.domain();

        const minTickCount = this.defaultTickCount;
        const duration = scaleDomain[1];

        let i = this.durationIntervals.length - 1;
        while (i >= 0 && duration / this.durationIntervals[i] < minTickCount) i--;

        const ticks = [];
        const chosenInterval = this.durationIntervals[i];
        let lastTick = 0;
        while (lastTick <= duration) {
            ticks.push(lastTick);
            lastTick += chosenInterval;
        }

        return ticks;
    }

    getDefaultRelativeTickFormat() {
        const suffixes = ['ms', 's', 'min', 'h', 'd', 'mo', 'y'];
        const durationBaseIntervalsArr = ['millisecond', 'second', 'minute', 'hour', 'day', 'month', 'year'].map(key => durationBaseIntervals[key]);

        const format = (ts) => {
            let i = durationBaseIntervalsArr.length - 1;

            while (i >= 0 && ts % durationBaseIntervalsArr[i] !== 0) i--;

            const count = ts / durationBaseIntervalsArr[i];
            return count + ' ' + suffixes[i];
        };

        return format;
    }

    relativeScaleInit() {
        const containerWidth = this.svgN.getClientRects()[0].width;
        const scale = scaleLinear()
            .domain([0, this.props.endTs])
            .range([0, containerWidth - this.props.margin.left - this.props.margin.right])
            .clamp(true);

        const ticks = this.props.ticks?.values ? this.props.ticks.values.sort() : this.getDefaultRelativeTicks(scale);
        if (ticks[0] !== 0) ticks.unshift(0);
        if (ticks[ticks.length - 1] !== this.props.endTs) ticks.push(this.props.endTs);

        const tickLabels = new Set(this.props.ticks?.labels);
        tickLabels.add(0);
        tickLabels.add(this.props.endTs);

        const defaultTickFormat = this.getDefaultRelativeTickFormat();

        const tickLabelFormat = this.props.ticks?.labels ?
            (ts) => tickLabels.has(ts) ? defaultTickFormat(ts) : null :
            defaultTickFormat;

        return {scale, ticks, tickLabelFormat};
    }

    absoluteScaleInit() {
        const containerWidth = this.svgN.getClientRects()[0].width;
        const scale = scaleTime()
            .domain([new Date(this.props.beginTs), new Date(this.props.endTs)])
            .range([0, containerWidth - this.props.margin.left - this.props.margin.right])
            .clamp(true);

        const ticks = this.props.ticks?.values ? this.props.ticks.values.map(ts => new Date(ts)).sort() : scale.ticks(this.defaultTickCount);
        if (ticks[0].valueOf() !== this.props.beginTs) ticks.unshift(new Date(this.props.beginTs));
        if (ticks[ticks.length - 1].valueOf() !== this.props.endTs) ticks.push(new Date(this.props.endTs));

        const labels = new Set(this.props.ticks?.labels);
        labels.add(this.props.beginTs);
        labels.add(this.props.endTs);

        const defaultFormat = scale.tickFormat();
        const tickLabelFormat = this.props.ticks?.labels ?
            (date) => labels.has(date.valueOf()) ? defaultFormat(date) : null :
            defaultFormat;

        return {scale, ticks, tickLabelFormat};
    }


    axisInit() {
        select(this.axisN)
            .attr("pointer-events", "bounding-box")
            .attr("transform", `translate(${this.props.margin.left}, ${this.props.margin.top})`);
        select(this.domainN).attr("width", this.state.scaleDef.scale.range()[1]);

        const generateDataForTick = (t, i, arr) => {
            const label = this.state.scaleDef.tickLabelFormat(t);
            const role = i === 0 ? "begin" :
                         i === arr.length - 1 ? "end" :
                         label.length > 0 ? "big" :
                         "small";

            return {pos: this.state.scaleDef.scale(t), label, role};
        };
        const ticksData = this.state.scaleDef.ticks.map(generateDataForTick);

        const longestLabelIdx = scan(ticksData, (d1, d2) => - d1.label.length + d2.label.length); //returns index of the element with the "lowest" value
        const maxLabelWidth = this.getPointerLabelWidth(ticksData[longestLabelIdx].label);

        const filteredTicksData = this.filterTicks(ticksData, maxLabelWidth);
        this.generateTicks(filteredTicksData);

        this.setState(prevState => ({
            nodes: {
                ...prevState.nodes,
                axis: select(this.domainN),
            }
        }));

    }

    generateTicks(ticksData) {
        const createTick = (sel) => {
            return sel.append("g")
                .classed("tick", true)
                .attr("pointer-events", "none")
                .call(sel => sel.append("line").attr("stroke", "currentColor").attr("stroke-width", 1.2))
                .call(sel => sel.append("text")
                    .classed(styles.tickLabel + " " + styles.label, true)
                    .attr("fill", "currentColor")
                    .attr("dy", "1em"))
;
        };

        const config = {
            begin: {
                updateTickMark: (sel) => sel.attr("y1", 0).attr("y2", 0),
                updateLabel: (sel, d) => sel.attr("y", 23).attr("text-anchor", "start").text(d.label),
            },
            end: {
                updateTickMark: (sel) => sel.attr("y1", 0).attr("y2", 0),
                updateLabel: (sel, d) => sel.attr("y", 23).attr("text-anchor", "end").text(d.label),
            },
            big: {
                updateTickMark: (sel) => sel.attr("y1", 20).attr("y2", 10),
                updateLabel: (sel, d) => sel.attr("y", 23).attr("text-anchor", "middle").text(d.label),
            },
            small: {
                updateTickMark: (sel) => sel.attr("y1", 20).attr("y2", 14),
                updateLabel: (sel) => sel.text(null),
            },
        };

        select(this.axisN).selectAll(".tick")
            .data(ticksData)
            .join(createTick)
            .attr("transform", d => `translate(${d.pos}, 0)`)
            .call(sel => sel.select("line")
                .each(function (d) {
                    config[d.role].updateTickMark(select(this));
                }))
            .call(sel => sel.select("text")
                .each(function (d) {
                    config[d.role].updateLabel(select(this), d);
                }));
    }

    filterTicks(ticksData, maxLabelWidth) {
        const tickConf = {
            begin: {
                priority: 10,
                getBegin: (d) => d.pos,
                getEnd: (d, width) => d.pos + width,
            },
            end: {
                priority: 9,
                getBegin: (d, width) => d.pos - width,
                getEnd: (d) => d.pos,
            },
            big: {
                priority: 2,
                getBegin: (d, width) => d.pos - width/2,
                getEnd: (d, width) => d.pos + width/2,
            },
            small: {
                priority: 1,
            }
        };

        let lastBigTick = ticksData[0];
        let lastTick = ticksData[0];
        const minSpace = 10;
        const labelMinSpace = 15;

        for(let i = 1; i < ticksData.length; i++) {
            const currTick = ticksData[i];
            const isSmallTick = currTick.role === "small";

            if (!isSmallTick &&
                tickConf[lastBigTick.role].getEnd(lastBigTick, maxLabelWidth) + labelMinSpace > tickConf[currTick.role].getBegin(currTick, maxLabelWidth)) {

                if (tickConf[currTick.role].priority <= tickConf[lastBigTick.role].priority) {
                    currTick.role = "small";
                } else {
                    lastBigTick.role = "small";
                    lastBigTick = currTick;
                }
            } else if (!isSmallTick) {
                lastBigTick = currTick;
            }

            if (lastTick.pos + minSpace > currTick.pos) {
                if (tickConf[currTick.role].priority <= tickConf[lastTick.role].priority) {
                    currTick.isOmitted = true;
                } else {
                    lastTick.isOmitted = true;
                    lastTick = currTick;
                }
            } else {
                lastTick = currTick;
            }
        }

        return ticksData.filter(d => !d.isOmitted);
    }

    getTickLabelWidth(label) {
        let labelWidth;
        select(this.testLabelN)
            .style("display", "block")
            .classed(styles.tickLabel, true)
            .text(label)
            .call(n => labelWidth = n.node().getBBox().width)
            .style("display", "none")
            .classed(styles.tickLabel, false);

        return labelWidth;
    }


    getPointerLabelWidth(label) {
        let labelWidth;
        select(this.testLabelN)
            .style("display", "block")
            .classed(styles.label, true)
            .text(label)
            .call( g => labelWidth = g.node().getBBox().width)
            .style("display", "none")
            .classed(styles.label, false);

        return labelWidth;
    }

    init() {
        const {scale, ticks, tickLabelFormat} = this.props.relative ? this.relativeScaleInit() : this.absoluteScaleInit();

        const realtimeToPosition = scaleTime()
            .domain([0, this.props.length])
            .range(scale.range())
            .clamp(true);

        const pointerLabelFormat = this.getPointerLabelFormat();


        select(this.pointerN)
            .attr("transform", `translate(${this.props.margin.left}, ${this.props.margin.top})`);

        select(this.hoverPointerN)
            .attr("transform", `translate(${this.props.margin.left}, ${this.props.margin.top})`)
            .style("display", "none");

        const pointerLabelWidth = this.getPointerLabelWidth(pointerLabelFormat(scale.domain()[0]));

        this.setState({
            nodes: {
                slider: select(this.svgN),
                pointer: select(this.pointerN),
                hoverPointer: select(this.hoverPointerN),
            },
            enabled: true,
            pointerLabelDef: {
                format: pointerLabelFormat,
                width: pointerLabelWidth,
            },
            realtimeToPosition,
            scaleDef: {
                scale,
                tickLabelFormat,
                ticks,
            },
        });
    }

    render() {
        const clampPos = this.state.scaleDef?.scale ? (pos) => Math.min(this.state.scaleDef.scale.range()[1], Math.max(this.state.scaleDef.scale.range()[0], pos)) : pos => pos;
        const getLabelShiftFor = (posC) => {
            return -(Math.min(0, posC - this.state.pointerLabelDef.width/2) || Math.max(0, posC + this.state.pointerLabelDef.width/2 - this.state.scaleDef.scale.range()[1]));
        };
        const nodes = this.state.nodes?.slider && this.state.nodes?.axis && this.state.nodes?.pointer && this.state.nodes?.hoverPointer && this.state.nodes;

        return (
            <>
                <SliderBaseEvents
                    nodes={nodes}
                    events={{
                        onPointerMoveTo: (pointerNode, pos) => {
                            const posC = clampPos(pos);

                            pointerNode.attr("x", posC);
                            select(this.playbackLineN).attr("width", posC);

                            select(this.labelN)
                                .text(this.state.pointerLabelDef.format(this.state.scaleDef.scale.invert(posC)))
                                .attr("x", getLabelShiftFor(posC));
                        },
                        onHoverPointerMoveTo: (pointerNode, pos, pointerPosC) => {
                            const posC = clampPos(pos);

                            pointerNode.attr("x", posC);
                            const labelShift = getLabelShiftFor(posC);
                            select(this.hoverLabelN)
                                .text(this.state.pointerLabelDef.format(this.state.scaleDef.scale.invert(posC)))
                                .attr("x", labelShift);

                            const pointerLabelPos = pointerPosC + getLabelShiftFor(pointerPosC);
                            if (Math.abs(pointerLabelPos - (posC + labelShift)) <= this.state.pointerLabelDef.width + 5) {
                                select(this.labelN).style("display", "none");
                            } else {
                                select(this.labelN).style("display", "block");
                            }
                        },
                        onPointerSetTo: (pos) => {
                        },
                        onHoverPointerAppear: (hoverPointerNode) => {
                            hoverPointerNode.style("display", "block");
                        },
                        onHoverPointerDisappear: (hoverPointerNode) => {
                            hoverPointerNode.style("display", "none");
                            select(this.labelN).style("display", "block");
                        },
                    }}
                    enabled={this.state.enabled}
                    value={this.state.realtimeToPosition && this.state.realtimeToPosition(this.props.position)}
                />

                {/*TODO: heigh??*/}
                <svg className={styles.timeline} xmlns="http://www.w3.org/2000/svg" ref={node => this.svgN = node} width="100%" height="120">
                    <defs>
                        <g id={`pointer_${this.props.id}`}>
                            <text id="label" className={styles.label} y="-13" dominantBaseline="baseline" textAnchor="middle" fill="currentColor" ref={node => this.labelN = node}></text>
                            <polygon className={styles.pointer} points="0,-3 -2,-6.464 2,-6.464"  strokeWidth="3" strokeLinejoin="round"/>
                        </g>
                        <g id={`hoverPointer_${this.props.id}`}>
                            <text id="hoverLabel" className={styles.label} textAnchor="middle" y="-13.5" fill="currentColor" ref={node => this.hoverLabelN = node}></text>
                            <polygon className={styles.hoverPointer}
                                points="0,-3 -2,-6.464 2,-6.464" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
                        </g>

                    </defs>
                    <text className={styles.label} ref={node => this.testLabelN = node} opacity="0"/>

                    <g ref={node => this.axisN = node}>
                        <rect className={styles.playbackLine} height="20" ref={node => this.playbackLineN = node}/>
                        <rect height="20" fill="none" rx="2" stroke="currentColor" strokeWidth="1.5" ref={node => this.domainN = node} />
                    </g>

                    <use href={`#pointer_${this.props.id}`} color="black" ref={node => this.pointerN = node}/>
                    <use href={`#hoverPointer_${this.props.id}`} color="black" ref={node => this.hoverPointerN = node} />
                </svg>
            </>
        );
    }
}

class SelectableTimeline extends Component {
    static propTypes = {
        height: PropTypes.number,
        width: PropTypes.number,
        margin: PropTypes.object,

        ticks: PropTypes.arrayOf(PropTypes.shape({
            ts: PropTypes.number,
            label: PropTypes.bool,
        })),
        relative: PropTypes.bool,
        beginTs: PropTypes.number, //TODO: can be relative and have beginTs?
        endTs: PropTypes.number,

        markers: PropTypes.object,
        defaultMarker: PropTypes.string,
        setMarkers: PropTypes.func,

        highlights: PropTypes.arrayOf(PropTypes.shape({
            beginning: PropTypes.string,
            end: PropTypes.string,
            className: PropTypes.string,
        })),
        selectors: PropTypes.arrayOf(PropTypes.shape({
            markerName: PropTypes.string,
            key: PropTypes.string,
            className: PropTypes.string,
            visible: PropTypes.bool,
            enabled: PropTypes.bool,
            comp: PropTypes.elementType,
        })),
    }

    constructor(props) {
        super(props);

        this.state = {
            markers: this.props.markers,
        };

        this.lockedMarkers = new Set();

        this.selectorPrecision = 3;
        this.defaultTickCount = 50;
        this.axisHeight = 40;


        this.durationIntervals = [
            1, 10, 50, 250, 500,

            durationBaseIntervals.second,
            5*durationBaseIntervals.second,
            15*durationBaseIntervals.seconds,
            30*durationBaseIntervals.second,

            durationBaseIntervals.minute,
            5*durationBaseIntervals.minute,
            15*durationBaseIntervals.minute,
            30*durationBaseIntervals.minute,

            durationBaseIntervals.hour,
            3*durationBaseIntervals.hour,
            6*durationBaseIntervals.hour,
            12*durationBaseIntervals.hour,

            durationBaseIntervals.day,
            5*durationBaseIntervals.day,
            15*durationBaseIntervals.day,

            durationBaseIntervals.month,
            3*durationBaseIntervals.month,

            durationBaseIntervals.year,
        ];
    }

    componentDidUpdate(prevProps) {
        console.log("selectable update", {props: this.props, state: this.state});
        if (this.props.width !== prevProps.width || this.props.margin !== prevProps.margin ||
            this.props.relative !== prevProps.relative || this.props.beginTs !== prevProps.beginTs || this.props.endTs !== prevProps.endTs ||
            this.props.ticks !== prevProps.ticks) {
            this.createTimeline();
        }

        if (this.props.defaultMarker && !prevProps.defaultMarker) {
            this.attachOnClickEvent();
        }

        if (this.props.markers !== prevProps.markers) {
            const updatedMarkerNames = Object.keys(this.props.markers).filter(thisMarkerName =>
                this.props.markers[thisMarkerName] !== prevProps.markers[thisMarkerName] && !this.lockedMarkers.has(thisMarkerName)
            );
            this.updateLocalMarkers(updatedMarkerNames);
        }

        if (this.props.selectors !== prevProps.selectors) {
            this.prepareSelectors();
        }
    }

    componentDidMount() {
        this.createTimeline();

        if (this.props.selectors) this.prepareSelectors();
        if (this.props.defaultMarker) this.attachOnClickEvent();
    }


    attachOnClickEvent() {
        select(this.axisN)
            .attr("cursor", "pointer")
            .on("click", () => {
                const pos = mouse(this.axisN)[0];
                const ts = this.state.scaleDef.scale.invert(pos);
                if (this.state.scaleDef) this.setGlobalMarkers({[this.props.defaultMarker]: ts});
            });
    }

    updateLocalMarkers(markerNames) {
        console.log("updating markers", markerNames);

        this.setState((state, props) => {
            const newMarkers = {...this.state.markers};
            markerNames.map(newName => newMarkers[newName] = props.markers[newName]);

            return {markers: newMarkers};
        });
    }

    setGlobalMarkers(markers) {
        console.log("selectable setting markers", markers);
        Object.keys(markers).map(markerName => this.lockedMarkers.delete(markerName));

        this.props.setMarkers(markers);
    }

    setLocalMarkers(markers) {
        console.log("set temp markers:" , markers);
        Object.keys(markers).map(markerName => this.lockedMarkers.add(markerName));

        this.setState(state => ({
            markers: Object.assign({}, state.markers, markers),
        }));
    }

    clearLocalMarker(markerName) {
        console.log("clearing temp marker", markerName);
        this.lockedMarkers.delete(markerName);

        this.setState(state => ({
            markers: Object.assign({}, state.markers, {[markerName]: this.props.markers[markerName]}),
        }));
    }


    getSelectorLabelFormat(scale) {
        const beginPos = scale.range()[0];
        const precision = scale.invert(beginPos + this.selectorPrecision) - scale.invert(beginPos);

        return this.props.relative ?
            generateDurationLabelFormat(scale.domain()[1], precision) :
            generateTimestampLabelFormat(scale.domain()[1] - scale.domain()[0], precision);
    }

    prepareSelectors() {
        this.setState({
            selectors: this.props.selectors.map(
                config => ({...config, comp: withTimelineAccess(config.comp)})
            )
        });
    }


    getDefaultRelativeTicks(scale) {
        const minTickCount = this.defaultTickCount;
        const duration = scale.domain()[1];

        let i = this.durationIntervals.length - 1;
        while (i >= 0 && duration / this.durationIntervals[i] < minTickCount) i--;

        const ticks = [];
        const chosenInterval = this.durationIntervals[i];
        let lastTickTs = 0;
        while (lastTickTs <= duration) {
            ticks.push({ts: lastTickTs, label: true});
            lastTickTs += chosenInterval;
        }

        return ticks;
    }

    getRelativeTickFormat() {
        const suffixes = ['ms', 's', 'min', 'h', 'd', 'mo', 'y'];
        const durationBaseIntervalsArr = ['millisecond', 'second', 'minute', 'hour', 'day', 'month', 'year'].map(key => durationBaseIntervals[key]);

        const format = ({ts, label}) => {
            if (!label) return null;
            //TODO: get better formatter
            //probably from moment blug-in https://github.com/jsmreese/moment-duration-format
            let i = durationBaseIntervalsArr.length - 1;

            while (i > 0 && ts < durationBaseIntervalsArr[i]) i--;

            const count = ts / durationBaseIntervalsArr[i];
            const numberOfDecimalDigits = Number.isInteger(count) ? 0 : 2;
            return count.toFixed(numberOfDecimalDigits) + ' ' + suffixes[i];
        };

        return format;
    }


    relativeScaleInit() {
        const scale = scaleLinear()
            .domain([0, this.props.endTs])
            .range([0, this.props.width - this.props.margin.left - this.props.margin.right])
            .clamp(true);

        const ticks = this.props.ticks ? this.props.ticks : this.getDefaultRelativeTicks(scale);

        return {scale, ticks, tickLabelFormat: this.getRelativeTickFormat()};
    }

    absoluteScaleInit() {
        const scale = scaleTime()
            .domain([this.props.beginTs, this.props.endTs])
            .range([0, this.props.width - this.props.margin.left - this.props.margin.right])
            .clamp(true);

        const ticks = this.props.ticks ? this.props.ticks.map(({ts, label}) => ({ts: new Date(ts), label})) : scale.ticks(this.defaultTickCount).map(d => ({ts: d, label: true}));

        const defaultFormat = scale.tickFormat();
        const tickLabelFormat = ({ts, label}) => label ? defaultFormat(ts) : null;

        return {scale, ticks, tickLabelFormat};
    }

    prepareTicks(scale, ticks, tickLabelFormat) {
        let includesBeginTick = false;
        let includesEndTick = false;
        let tickData = [];

        const createBeginTick = () => ( {
            pos: scale(scale.domain()[0]),
            label: tickLabelFormat({ts: scale.domain()[0], label: true}),
            role: "begin"
        });

        const createEndTick = () => ({
            pos: scale(scale.domain()[1]),
            label: tickLabelFormat({ts: scale.domain()[1], label: true}),
            role: "end"
        });

        for(let tick of ticks) {
            if (tick.ts === scale.domain()[0]) {
                tickData.push(createBeginTick());
                continue;
            }
            if (ticks.ts === scale.domain()[1]) {
                tickData.push(createEndTick());
                continue;
            }

            let role = tick.label ? "big" : "small";
            const pos = scale(tick.ts);
            let label = tickLabelFormat(tick);

            tickData.push({pos, label, role});
        }

        if (!includesBeginTick) tickData.push(createBeginTick());
        if (!includesEndTick) tickData.push(createEndTick());

        return tickData;
    }

    filterTicks(ticksData, maxLabelWidth) {
        const tickConf = {
            begin: {
                priority: 10,
                getBegin: (d) => d.pos,
                getEnd: (d, width) => d.pos + width,
            },
            end: {
                priority: 9,
                getBegin: (d, width) => d.pos - width,
                getEnd: (d) => d.pos,
            },
            big: {
                priority: 2,
                getBegin: (d, width) => d.pos - width/2,
                getEnd: (d, width) => d.pos + width/2,
            },
            small: {
                priority: 1,
            }
        };

        ticksData.sort((t1, t2) => t1.pos - t2.pos);

        let lastBigTick = ticksData[0];
        let lastTick = ticksData[0];
        const minSpace = 10;
        const labelMinSpace = 15;

        for(let i = 1; i < ticksData.length; i++) {
            const currTick = ticksData[i];
            const isSmallTick = currTick.role === "small";

            if (!isSmallTick &&
                tickConf[lastBigTick.role].getEnd(lastBigTick, maxLabelWidth) + labelMinSpace > tickConf[currTick.role].getBegin(currTick, maxLabelWidth)) {

                if (tickConf[currTick.role].priority <= tickConf[lastBigTick.role].priority) {
                    currTick.role = "small";
                } else {
                    lastBigTick.role = "small";
                    lastBigTick = currTick;
                }
            } else if (!isSmallTick) {
                lastBigTick = currTick;
            }

            if (lastTick.pos + minSpace > currTick.pos) {
                if (tickConf[currTick.role].priority <= tickConf[lastTick.role].priority) {
                    currTick.isOmitted = true;
                } else {
                    lastTick.isOmitted = true;
                    lastTick = currTick;
                }
            } else {
                lastTick = currTick;
            }
        }

        return ticksData.filter(d => !d.isOmitted);
    }

    generateTicks(ticksData) {
        const createTick = (sel) => {
            return sel.append("g")
                .classed("tick", true)
                .attr("pointer-events", "none")
                .call(sel => sel.append("line").attr("stroke", "currentColor").attr("stroke-width", 1.2))
                .call(sel => sel.append("text")
                    .classed(styles.tickLabel + " " + styles.label, true)
                    .attr("fill", "currentColor")
                    .attr("dy", "1em"));
        };

        const config = {
            begin: {
                updateTickMark: (sel) => sel.attr("y1", 0).attr("y2", 0),
                updateLabel: (sel, d) => sel.attr("y", 23).attr("text-anchor", "start").text(d.label),
            },
            end: {
                updateTickMark: (sel) => sel.attr("y1", 0).attr("y2", 0),
                updateLabel: (sel, d) => sel.attr("y", 23).attr("text-anchor", "end").text(d.label),
            },
            big: {
                updateTickMark: (sel) => sel.attr("y1", 20).attr("y2", 10),
                updateLabel: (sel, d) => sel.attr("y", 23).attr("text-anchor", "middle").text(d.label),
            },
            small: {
                updateTickMark: (sel) => sel.attr("y1", 20).attr("y2", 14),
                updateLabel: (sel) => sel.text(null),
            },
        };

        select(this.axisN).selectAll(".tick")
            .data(ticksData)
            .join(createTick)
            .attr("transform", d => `translate(${d.pos}, 0)`)
            .call(sel => sel.select("line")
                .each(function (d) {
                    config[d.role].updateTickMark(select(this));
                }))
            .call(sel => sel.select("text")
                .each(function (d) {
                    config[d.role].updateLabel(select(this), d);
                }));
    }

    getTickLabelWidth(label) {
        let labelWidth;
        select(this.testLabelN)
            .style("display", "block")
            .classed(styles.tickLabel, true)
            .text(label)
            .call(n => labelWidth = n.node().getBBox().width)
            .style("display", "none")
            .classed(styles.tickLabel, false);

        return labelWidth;
    }

    drawTicks(scale, ticks, tickLabelFormat) {
        const ticksData = this.prepareTicks(scale, ticks, tickLabelFormat);

        const longestLabelIdx = scan(ticksData, (d1, d2) => - d1.label.length + d2.label.length);
        const maxLabelWidth = this.getTickLabelWidth(ticksData[longestLabelIdx].label);
        const filteredTicksData = this.filterTicks(ticksData, maxLabelWidth);
        this.generateTicks(filteredTicksData);
    }

    createTimeline() {
        const {scale, ticks, tickLabelFormat} = this.props.relative ? this.relativeScaleInit() : this.absoluteScaleInit();

        this.drawTicks(scale, ticks, tickLabelFormat);

        const selectorLabelFormat = this.getSelectorLabelFormat(scale);

        this.setState({
            scaleDef: {
                scale,
                tickLabelFormat,
                ticks,
            },
            selectorLabelFormat,
        });
    }

    render() {
        console.log("selected render", {markers: this.state.markers});

        const domainHeight = this.props.height - this.axisHeight;
        const containerWidth = this.props.width - this.props.margin.left - this.props.margin.right;
        const containerHeight = this.props.height - this.props.margin.top - this.props.margin.bottom;

        const highlightComp = (props) => {
            const beginningPos = this.state.scaleDef.scale(this.state.markers[props.beginning]);
            const width = this.state.scaleDef.scale(this.state.markers[props.end]) - beginningPos;

            return <rect height="20" rx="2" className={props.className + " highlight"} x={beginningPos} width={width} key={props.key}/>;
        };

        const selectorComp = (config) => {
            const {key, comp, ...props} = config;
            const Comp = comp;

            return (
                <Comp
                    key={key}

                    markers={this.state.markers}
                    y={domainHeight}

                    labelFormat={this.state.selectorLabelFormat}
                    scale={this.state.scaleDef.scale}

                    setGlobalMarkers={::this.setGlobalMarkers}
                    setLocalMarkers={::this.setLocalMarkers}
                    clearLocalMarker={::this.clearLocalMarker}

                    markerName={props.markerName}
                    visible={props.visible}
                    className={props.className}
                    enabled={props.enabled}
                    parentNode={this.containerN}
                />
            );
        };

        return (
            <svg className={styles.timeline} xmlns="http://www.w3.org/2000/svg"
                ref={node => this.svgN = node}
                width={this.props.width + this.props.margin.left + this.props.margin.right}
                height={this.props.height + this.props.margin.bottom + this.props.margin.top}>

                <text ref={node => this.testLabelN = node} opacity="0"/>
                <g ref={node => this.containerN = node}
                    pointerEvents="bounding-box"
                    transform={`translate(${this.props.margin.left}, ${this.props.margin.top})`} >
                    <rect width={containerWidth} height={containerHeight} fill="none" />

                    {this.state.selectors && this.props.selectors.map(selectorComp)}

                    <g ref={node => this.axisN = node}
                        transform={`translate(0, ${domainHeight})`}
                        pointerEvents="bounding-box">
                        <g>
                            {this.props.highlights && this.state.scaleDef && this.props.highlights.map(highlightComp)}
                        </g>

                        <rect height="20" fill="none" rx="2" stroke="currentColor" strokeWidth="1.5" width={this.state.scaleDef && this.state.scaleDef.scale.range()[1]}/>
                    </g>
                </g>
            </svg>
        );
    }
}


const Selector = React.forwardRef(function Selector(props, ref) {
    const [labelWidth, setLabelWidth] = useState(null);

    const labelRef = useRef(null);
    useEffect(() => setLabelWidth(labelRef.current.getBBox().width), []);

    let labelShift = 0;
    if (labelWidth) {
        const leftLabelBoundary = props.boundaries[0] + labelWidth/2;
        const rightLabelBoundary = props.boundaries[1] - labelWidth/2;

        labelShift = Math.max(0, leftLabelBoundary - props.x) || Math.min(0, rightLabelBoundary - props.x);
    }
    console.log("selector render", {labelWidth});
    return (
        <>
            {props.visible &&
                <g className={props.className} transform={`translate(${props.x}, ${props.y})`} ref={ref}>
                    <text
                        transform={`translate(${labelShift}, 0)`}
                        ref={labelRef}
                        className={styles.label}
                        textAnchor="middle"
                        y="-13.5"
                        fill="currentColor"
                        opacity={labelWidth ? 1 : 0}>
                        {props.label}
                    </text>
                    <polygon className={styles.selector}
                        points="0,-3 -2,-6.464 2,-6.464" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
                </g>
            }
        </>
    );
});
Selector.propTypes = {
    className: PropTypes.string,
    visible: PropTypes.bool,
    x: PropTypes.number,
    y: PropTypes.number,
    label: PropTypes.string,
    boundaries: PropTypes.arrayOf(PropTypes.number),
};

function withDrag(Selector) {
    class DraggableSelector extends Component {
        static propTypes = {
            setGlobal: PropTypes.func,
            setLocal: PropTypes.func,
            clearLocal: PropTypes.func,

            enabled: PropTypes.bool,

            parentNode: PropTypes.object,
        }

        constructor(props) {
            super(props);

            this.sliding = false;
        }

        componentDidUpdate(prevProps) {
            if (this.props.enabled && (!prevProps.enabled || this.props.parentNode !== prevProps.parentNode)) {
                this.attachDragEvents();
            }

            if (!this.props.enabled && prevProps.enabled) {
                this.detachDragEvents();
            }
        }

        componentDidMount() {
            if (this.props.enabled) this.attachDragEvents();
        }

        attachDragEvents() {
            const parentSel = select(this.props.parentNode);
            const selectorSel = select(this.selectorN);

            const endSliding = () => {
                parentSel
                    .on("mousemove.selectorDrag", null)
                    .on("mouseleave.selectorDrag", null)
                    .on("mouseup.selectorDrag", null);
            };

            selectorSel
                .attr("cursor", "pointer")
                .on("mousedown", () => {
                    parentSel
                        .on("mousemove.selectorDrag", () =>
                            this.props.setLocal(mouse(this.props.parentNode)[0])
                        )
                        .on("mouseleave.selectorDrag", () => {
                            this.props.clearLocal();
                            endSliding();
                        })
                        .on("mouseup.selectorDrag", () => {
                            this.props.setGlobal(mouse(this.props.parentNode)[0]);
                            endSliding();
                        });
                });
        }

        detachDragEvents() {
            select(this.selectorN)
                .attr("cursor", "default")
                .on("mousedown", null);
        }

        render() {
            const {setGlobal, setLocal, clearLocal, parentNode, enabled, ...rest} = this.props;

            return ( <Selector  {...rest} ref={node => this.selectorN = node}/>);
        }

    }

    return DraggableSelector;
}

function withTimelineAccess(Selector) {
    class TimelineSelector extends Component {
        static propTypes = {
            markers: PropTypes.object,
            markerName: PropTypes.string,

            labelFormat: PropTypes.func,
            scale: PropTypes.func,

            setGlobalMarkers: PropTypes.func,
            setLocalMarkers: PropTypes.func,
            clearLocalMarker: PropTypes.func,
            enabled: PropTypes.bool,
            parentNode: PropTypes.object,

            y: PropTypes.number,
            visible: PropTypes.bool,
            className: PropTypes.string,
        }

        constructor(props) {
            super(props);

            this.setGlobal = (pos) => {
                const ts = this.props.scale.invert(pos);
                this.props.setGlobalMarkers({[this.props.markerName]: ts});
            };

            this.setLocal = (pos) => {
                const ts = this.props.scale.invert(pos);
                this.props.setLocalMarkers({[this.props.markerName]: ts});
            };

            this.clearLocal = () => {
                this.props.clearLocalMarker(this.props.markerName);
            };

            this.state = {
                boundaries: this.props.scale.range(),
            };
        }

        componentDidUpdate(prevProps) {
            if (this.props.scale !== prevProps.scale) {
                this.setState({boundaries: this.props.scale.range()});
            }
        }

        render() {
            const ts = this.props.markers[this.props.markerName];
            console.log("wta render", ts);

            return (
                <Selector
                    x={this.props.scale(ts)}
                    y={this.props.y}
                    className={this.props.className}
                    visible={this.props.visible}

                    setGlobal={::this.setGlobal}
                    setLocal={::this.setLocal}
                    clearLocal={::this.clearLocal}
                    parentNode={this.props.parentNode}
                    enabled={this.props.enabled}

                    label={this.props.labelFormat(ts)}
                    boundaries={this.state.boundaries}
                />
            );
        }
    }

    return TimelineSelector;
}

class AnimationTimeline extends Component {
    static propTypes = {
        animConfig: PropTypes.object,
        animControl: PropTypes.object,
        animStatus: PropTypes.object,

        width: PropTypes.number,
    }


    constructor(props) {
        super(props);

        this.state = {
            markers: {
                beginning: this.props.animConfig.timeline.beginTs,
                playbackPosition: this.props.animStatus.position,
            },
            margin: {
                left: 20,
                right: 20,
                bottom: 10,
                top: 30,
            },
        };

        this.selectors = [
            {
                markerName: "playbackPosition",
                key: "playbackPositionSelector",
                className: styles.playbackPositionSelector,
                visible: true,
                enabled: true,
                comp: withDrag(Selector),
            },
        ];

        this.highlights = [
            {beginning: "beginning", end: "playbackPosition", className: styles.playedHighlight, key: "playedHighlight"},
        ];
    }

    componentDidUpdate(prevProps, prevState) {
        console.log("animation update", {props: this.props, state: this.state});
        if (this.props.animConfig !== prevProps.animConfig || this.props.animStatus !== prevProps.animStatus) {
            this.setMarkers({
                beginning: this.props.animConfig.timeline.beginTs,
                playbackPosition: this.props.animStatus.position
            });
        }

        if (this.state.markers.playbackPosition !== prevState.markers.playbackPosition) {
            console.log("Pushing playback position change ups");
        }
    }

    setMarkers(markersOverride) {
        console.log("animation, setting markers:", markersOverride);
        this.setState(prevState => ({markers: Object.assign({}, prevState.markers, markersOverride)}));
    }

    render() {
        console.log("anim render, markers:", this.state.markers);

        return (
            <>
                <SelectableTimeline
                    {...this.props.animConfig.timeline}
                    width={this.props.width}
                    height={100}
                    margin={this.state.margin}

                    defaultMarker={"playbackPosition"}
                    markers={this.state.markers}
                    setMarkers={::this.setMarkers}

                    highlights={this.highlights}
                    selectors={this.selectors}
                />
            </>
        );
    }
}


class SliderBaseEvents extends Component {
    static propTypes = {
        nodes: PropTypes.shape({
            slider: PropTypes.object.isRequired,
            pointer: PropTypes.object.isRequired,
            axis: PropTypes.object.isRequired,

            hoverPointer: PropTypes.object,
        }),
        events: PropTypes.object,
        enabled: PropTypes.bool,
        value: PropTypes.any,
    }

    static defaultProps = {
        enabled: false,
        events: {},
    }

    constructor(props) {
        super(props);

        this.state = {
            position: this.props.value || 0,
            hoverPosition: 0,
            hoverPointerVisisible: false,
        };

        this.sliding = false;
        this.eventHandlersAttached = false;
    }

    componentDidUpdate(prevProps) {
        if ((this.props.nodes !== prevProps.nodes || !prevProps.enabled) && this.props.enabled && this.props.nodes) {
            this.attachEventHandlers();
        }

        if (!this.props.enabled && prevProps.enabled) {
            this.detachEventHandlers();
        }

        if (this.props.value !== prevProps.value && !this.sliding) {
            this.setState({position: this.props.value});
        }
    }

    componentDidMount() {
        if (this.props.nodes && this.props.enabled) {
            this.attachEventHandlers();
        }
    }

    getMousePos() {
        return mouse(this.props.nodes.axis.node())[0];
    }

    emit(event, ...args) {
        this.props.events[event] && this.props.events[event](...args);
    }

    attachEventHandlers() {
        const sliderNode = this.props.nodes.slider;
        const axisNode = this.props.nodes.axis;
        const pointerNode = this.props.nodes.pointer;

        const terminateSliding = () => {
            sliderNode.on("mousemove", null);
            axisNode.attr("pointer-events", this.axisNodePointerEvents);
            this.sliding = false;
        };

        const startSliding = () => {
            this.sliding = true;
            this.axisNodePointerEvents = axisNode.attr("pointer-events");
            axisNode.attr("pointer-events", "none");

            sliderNode.on("mousemove", () => this.setState({position: this.getMousePos()}));
        };

        //---Slider---
        sliderNode.
            on("mouseup", () => {
                if (!this.sliding) return;
                terminateSliding();
                this.emit("onPointerSetTo", this.state.position);
            }).
            on("mouseleave", () => {
                if (!this.sliding) return;
                terminateSliding();
                this.setState({position: this.props.value});
            });

        //---axis---
        axisNode
            .on("click", () => {
                const mousePos = this.getMousePos();
                this.setState({position: mousePos});
                this.emit("onPointerSetTo", mousePos);
            })
            .style("cursor", "pointer")
            .style("user-select", "none");

        //---Pointer---
        pointerNode
            .style("cursor", "pointer")
            .on("mousedown", startSliding)
            .on("mouseenter", () => this.emit("onPointerMouseEnter", pointerNode))
            .on("mouseleave", () => this.emit("onPointerMouseLeave", pointerNode));

        //---Hover---
        if (this.props.nodes.hoverPointer) {
            axisNode
                .on("mouseenter", () => {
                    this.emit("onHoverPointerAppear", this.props.nodes.hoverPointer);
                    this.setState({hoverPointerVisible: true});
                })
                .on("mouseleave", () => {
                    this.emit("onHoverPointerDisappear", this.props.nodes.hoverPointer);
                    this.setState({hoverPointerVisible: false});
                })
                .on("mousemove", () => this.setState({hoverPosition: this.getMousePos()}));
        }
    }

    detachEventHandlers() {
        const sliderNode = this.props.nodes?.slider;
        const pointerNode = this.props.nodes?.pointer;
        const axisNode = this.props.nodes?.axis;

        sliderNode && sliderNode.on("mouseleave mouseup", null);
        pointerNode && pointerNode.on("mousedown", null);

        if (axisNode) {
            const eventsRegistered = this.props.nodes?.hoverPointer ? "mouseenter mouseleave mousemove click" : "click";
            axisNode.
                on(eventsRegistered, null);
        }
    }

    render() {
        this.props.nodes?.pointer && this.emit("onPointerMoveTo", this.props.nodes.pointer, this.state.position);
        this.state.hoverPointerVisible && this.props.nodes?.hoverPointer && this.emit("onHoverPointerMoveTo", this.props.nodes.hoverPointer, this.state.hoverPosition, this.state.position);

        return <></>;
    }

}

//Implementation of slider logic
class SliderBase extends Component {
    static propTypes = {
        nodes: PropTypes.object,

        enabled: PropTypes.bool,
        withHover: PropTypes.bool,

        valueToPos: PropTypes.func,
        posToValue: PropTypes.func,

        value: PropTypes.any,
        setValue: PropTypes.func,
        printValue: PropTypes.func,
        // snapToValue: PropTypes.func,

        movePointer: PropTypes.func,
        moveHoverPointer: PropTypes.func,
    }

    static defaultProps = {
        nodes: {},
        withHover: false,
        enabled: false,
    }

    constructor(props) {
        super(props);

        this.isSliding = false;
        this.state = {
            value: props.value || 0,
            hoverValue: 0,
        };
    }

    componentDidUpdate(prevProps) {
        if (!this.props.enabled && prevProps.enabled) {
            this.disable();
            return;
        }

        if (this.props.enabled && !prevProps.enabled) {
            this.enable();
        } else if (this.props.enabled && this.props.withHover && !prevProps.withHover) {
            this.enableHover();
        } else if (this.props.enabled && !this.props.withHover && prevProps.withHover) {
            this.disableHover();
        }

        if (prevProps.value !== this.props.value && this.props.value && !this.isSliding) {
            this.setState({value: this.props.value});
        }
    }

    componentDidMount() {
        if (this.props.enabled) this.enable();
    }

    enable() {
        const sliderNode = this.props.nodes.slider;
        const scaleNode = this.props.nodes.scale;
        const labelNode = this.props.nodes.label;
        const pointerNode = this.props.nodes.pointer;

        const terminateSliding = () => {
            sliderNode.on("mousemove", null);
            scaleNode.attr("pointer-events", this.scaleNodePointerEvents);
            labelNode.attr("pointer-events", this.labelNodePointerEvents);
        };

        const startSliding = () => {
            this.isSliding = true;
            this.scaleNodePointerEvents = scaleNode.attr("pointer-events");
            this.labelNodePointerEvents = labelNode.attr("pointer-events");
            labelNode.attr("pointer-events", "none");
            scaleNode.attr("pointer-events", "none");

            sliderNode.on("mousemove", () => {
                this.setState({value: this.getMouseValue()});
            });
        };

        //---Slider---
        sliderNode.
            on("mouseup", () => {
                if (!this.isSliding) return;

                terminateSliding();

                this.sendChangeUp();
                this.isSliding = false;
            }).
            on("mouseleave", () => {
                if (!this.isSliding) return;
                terminateSliding();

                this.setState({value: this.props.value});
                this.isSliding = false;
            });

        //---Scale---
        scaleNode
            .on("click", () => {
                this.setState({value: this.getMouseValue()});
                this.sendChangeUp();
            })
            .style("cursor", "pointer")
            .style("user-select", "none");

        //---Pointer---
        pointerNode.
            style("cursor", "pointer").
            on("mousedown", startSliding);

        //---Label---
        labelNode
            .style("user-select", "none");

        if (this.props.withHover) this.enableHover();
    }

    enableHover() {
        const hoverLabelNode = this.props.nodes.hoverLabel;
        const hoverPointerNode = this.props.nodes.hoverPointer;
        const scaleNode = this.props.nodes.scale;
        const labelNode = this.props.nodes.label;

        hoverLabelNode.style("user-select", "none");
        scaleNode.
            on("mouseenter", () => {
                hoverPointerNode.style("display", "block");
                labelNode.style("display", "none");
            }).
            on("mouseleave", () => {
                hoverPointerNode.style("display", "none");
                labelNode.style("display", "block");
            }).
            on("mousemove", () => this.setState({hoverValue: this.getMouseValue()}));
    }

    disable() {
        const sliderNode = this.props.nodes.slider;
        const pointerNode = this.props.nodes.pointer;
        const scaleNode = this.props.nodes.scale;

        if (sliderNode) {
            sliderNode
                .on("mouseleave mouseup", null);
        }

        if (pointerNode) {
            pointerNode
                .on("mousedown", null);
        }

        if (scaleNode) {
            scaleNode.
                on("click", null);
        }

        if (this.props.withHover) this.disableHover();
    }

    disableHover() {
        const scaleNode = this.props.nodes.scale;
        if (scaleNode) scaleNode.on("mouseenter mouseleave mousemove", null);
    }


    getMouseValue() {
        const x = mouse(this.props.nodes.scale.node())[0];
        const value = this.props.posToValue(x);
        return this.props.snapToValue ? this.props.snapToValue(value) : value;
    }

    sendChangeUp() {
        const success = this.props.setValue(this.state.value);
        if (!success) this.setState({value: this.props.value});
    }

    render() {
        if (this.props.printValue && this.props.valueToPos) {
            if (this.props.nodes.pointer && this.props.movePointer)
                this.props.movePointer(this.props.nodes.pointer, this.props.valueToPos(this.state.value));
            if (this.props.nodes.label)
                this.props.nodes.label.text(this.props.printValue(this.state.value));

            if (this.props.moveHoverPointer && this.props.withHover && this.props.valueToPos) {
                this.props.moveHoverPointer(this.props.nodes.hoverPointer, this.props.valueToPos(this.state.hoverValue));
                this.props.nodes.hoverLabel.text(this.props.printValue(this.state.hoverValue));
            }
        }

        return (
            <></>
        );
    }

}

export {MediaButton, PlayPauseButton, StopButton, JumpForwardButton, JumpBackwardButton, PlaybackSpeedSlider, SliderBase, Timeline, SelectableTimeline, AnimationTimeline};
