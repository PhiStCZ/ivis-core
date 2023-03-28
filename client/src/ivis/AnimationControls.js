"use strict";

import React, {Component} from "react";
import PropTypes from "prop-types";
import {select, mouse} from "d3-selection";
import {scaleLinear, scaleTime} from "d3-scale";
import {format} from "d3-format";
import {interpolateString} from "d3-interpolate";
import moment from "moment";

import styles from "./AnimationControls.scss";
import {withAnimationControl} from "./AnimationCommon";
import {withComponentMixins} from "../lib/decorator-helpers";
import {Button, ButtonDropdown, Icon} from "../lib/bootstrap-components";
import {intervalAccessMixin} from "./TimeContext";

const defaultPlaybackSpeedSteps = [
    1,
    moment.duration(1, "m").asSeconds(),
    moment.duration(1, "h").asSeconds(),
    moment.duration(6, "h").asSeconds(),
    moment.duration(1, "d").asSeconds(),
    moment.duration(1, "w").asSeconds(),
    moment.duration(1, "M").asSeconds(),
];

@withComponentMixins([withAnimationControl])
class PlayPauseButton extends Component {
    static propTypes = {
        animationControl: PropTypes.object.isRequired,
        animationStatus: PropTypes.object.isRequired,
        enabled: PropTypes.bool,

        className: PropTypes.string,
    }

    constructor(props) {
        super(props);

        this.state = {
            isPlaying: props.animationStatus.isPlaying,
        };
    }

    componentDidUpdate(prevProps) {
        if (this.props.animationStatus.isPlaying !== prevProps.animationStatus.isPlaying) {
            this.setState({isPlaying: this.props.animationStatus.isPlaying});
        }
    }

    handleClick() {
        if (this.state.isPlaying) {
            this.setState({isPlaying: false});
            this.props.animationControl.pause();
        } else {
            this.setState({isPlaying: true});
            this.props.animationControl.play();
        }
    }

    render() {
        const icon = this.state.isPlaying ? "pause" : "play";
        const title = icon.charAt(0).toUpperCase() + icon.slice(1);

        return (
            <Button
                title={title}
                icon={icon}
                className={styles.mediaButton + " " + (this.props.className || "")}

                type={"button"}
                onClickAsync={::this.handleClick}
                disabled={!this.props.animationControl.play || !this.props.animationControl.pause || !this.props.enabled}
            />
        );
    }
}

@withComponentMixins([withAnimationControl])
class StopButton extends Component {
    static propTypes = {
        animationControl: PropTypes.object.isRequired,
        animationStatus: PropTypes.object.isRequired,
        enabled: PropTypes.bool,

        className: PropTypes.string,
    }

    render() {
        return (
            <Button
                title={"Stop"}
                icon={"stop"}
                className={styles.mediaButton + " " + (this.props.className || "")}

                type={"button"}
                onClickAsync={this.props.animationControl.stop}
                disabled={!this.props.animationControl.stop || !this.props.enabled}
            />
        );
    }
}

@withComponentMixins([withAnimationControl, intervalAccessMixin()])
class JumpForwardButton extends Component {
    static propTypes = {
        animationControl: PropTypes.object.isRequired,
        animationStatus: PropTypes.object.isRequired,

        enabled: PropTypes.bool,
        jumpFactor: PropTypes.number,

        className: PropTypes.string,
    }

    static defaultProps = {
        jumpFactor: 0.01,
    }

    constructor(props) {
        super(props);

        this.jumpBound = ::this.jump;
    }

    jump() {
        const intvAbs = this.getIntervalAbsolute();
        const jumpDistance = (intvAbs.to.valueOf() - intvAbs.from.valueOf()) * this.props.jumpFactor;

        this.props.animationControl.jumpForward(jumpDistance);
    }

    render() {
        return (
            <Button
                title={"Jump froward"}
                icon={"step-forward"}
                className={styles.mediaButton + " " + (this.props.className || "")}

                type={"button"}
                onClickAsync={this.props.animationControl.jumpForward && this.jumpBound}
                disabled={!this.props.animationControl.jumpForward && this.props.enabled}
            />
        );
    }
}

@withComponentMixins([withAnimationControl, intervalAccessMixin()])
class JumpBackwardButton extends Component {
    static propTypes = {
        animationControl: PropTypes.object.isRequired,
        animationStatus: PropTypes.object.isRequired,

        enabled: PropTypes.bool,
        jumpFactor: PropTypes.number,

        className: PropTypes.string,
    }

    static defaultProps = {
        jumpFactor: 0.01,
    }

    constructor(props) {
        super(props);

        this.jumpBound = ::this.jump;
    }

    jump() {
        const intvAbs = this.getIntervalAbsolute();
        const jumpDistance = (intvAbs.to.valueOf() - intvAbs.from.valueOf()) * this.props.jumpFactor;

        this.props.animationControl.jumpBackward(jumpDistance);
    }

    render() {
        return (
            <Button
                title={"Jump backward"}
                icon={"step-backward"}
                className={styles.mediaButton + " " + (this.props.className || "")}

                type={"button"}
                onClickAsync={this.props.animationControl.jumpBackward && this.jumpBound}
                disabled={!this.props.animationControl.jumpBackward || !this.props.enabled}
            />
        );
    }
}

@withComponentMixins([withAnimationControl])
class ChangeSpeedDropdown extends Component {
    static propTypes = {
        animationControl: PropTypes.object.isRequired,
        animationStatus: PropTypes.object.isRequired,

        enabled: PropTypes.bool,
        steps: PropTypes.arrayOf(PropTypes.number),

        factorFormat: PropTypes.func,
        classNames: PropTypes.object,
    }

    static defaultProps = {
        classNames: {},
        steps: defaultPlaybackSpeedSteps,
        // TODO nicer format this is seconds
        factorFormat: (f) => moment.duration(f, 'seconds').humanize(),
    }

    constructor(props) {
        super(props);

        this.state = {
            factor: props.animationStatus.playbackSpeedFactor || 1,
        };
    }

    componentDidUpdate(prevProps) {
        if (this.props.animationStatus.playbackSpeedFactor !== prevProps.animationStatus.playbackSpeedFactor) {
            this.setState({factor: this.props.animationStatus.playbackSpeedFactor});
        }
    }

    handleSpeedChange(factor) {
        this.setState({factor});

        this.props.animationControl.changeSpeed(factor);
    }

    getStepComps() {
        const steps = [...this.props.steps];
        steps.sort((x, y) => x - y);

        const comps = [];
        for (const factor of steps) {
            const className = styles.changeSpeedMenuItem + " dropdown-item" + " " +
                (factor === this.state.factor ? "active " + styles.active : "") + " " +
                (this.props.classNames.menuItem || "");

            const label = this.props.factorFormat(factor);

            comps.push(
                <Button
                    title={`Multiply playback speed by ${label}`}
                    label={label}
                    className={className}

                    type={"button"}
                    onClickAsync={this.handleSpeedChange.bind(this, factor)}

                    key={factor}
                />
            );
        }

        return comps;
    }

    render() {
        const disabled = !this.props.animationControl.changeSpeed || !this.props.enabled;
        const label = <>
            <Icon className={"btn-icon mr-2"} icon={"clock"} />
            {this.props.factorFormat(this.state.factor)}
            <span className={styles.spacer}/>
        </>;

        return (
            <ButtonDropdown
                label={label}
                className={styles.changeSpeedDropdown + " " + (this.props.classNames.dropdown || "")}
                buttonClassName={
                    styles.changeSpeedButton + " " +
                    (this.props.classNames.button || "") + " " +
                    (disabled ? "disabled" : "")
                }
                menuClassName={styles.changeSpeedMenu + " " + (this.props.classNames.menu || "")}>

                {this.getStepComps()}
            </ButtonDropdown>
        );
    }
}

@withComponentMixins([withAnimationControl, intervalAccessMixin()])
class Timeline extends Component {
    static propTypes = {
        animationControl: PropTypes.object.isRequired,
        animationStatus: PropTypes.object.isRequired,

        enabled: PropTypes.bool,
        positionFormatString: PropTypes.string,

        classNames: PropTypes.object,
    }

    static defaultProps = {
        classNames: {},
        positionFormatString: "L LTS",
    }

    constructor(props) {
        super(props);

        this.updateAxisRectBound = ::this.updateAxisRect;

        this.nodeRefs = {
            axis: null,
            pointer: null,
            positionLabel: null,
            ticks: null,
        };

        this.getPercScale = () => {
            const intv = this.getIntervalAbsolute();
            return scaleLinear()
                .domain([intv.from.valueOf(), intv.to.valueOf()])
                .range(["2%", "98%"])
                .interpolate(interpolateString)
                .clamp(true);
        };

        this.state = {
            axisRect: null,
            position: props.animationStatus.position,
        };
    }

    componentDidUpdate(prevProps, prevState) {
        if ((this.props.enabled && !prevProps.enabled) ||
            (this.props.animationControl.seek && !prevProps.animationControl.seek)) {

            this.enable();
        } else if ((prevProps.enabled && !this.props.enabled) ||
                (prevProps.animationControl.seek && !this.props.animationControl.seek)) {

            this.disable();
        }

        const prevIntvAbs = this.getIntervalAbsolute(prevProps);
        if (this.state.axisRect !== prevState.axisRect ||
            this.getIntervalAbsolute() !== prevIntvAbs) {
            this.updateTicks();
        }

        if (this.props.animationStatus.position !== prevProps.animationStatus.position && !this.sliding) {
            this.setState({position: this.props.animationStatus.position});
        }
    }

    componentDidMount() {
        if (this.props.enabled && this.props.animationControl.seek) this.enable();
        window.addEventListener("resize", this.updateAxisRectBound);

        this.updateAxisRect();
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.updateAxisRectBound);
    }

    enable() {
        const posLabelSel = select(this.nodeRefs.positionLabel);
        const hoverPosLabelSel = select(this.nodeRefs.hoverPositionLabel);
        const progressBarSel = select(this.nodeRefs.progressBar);
        const pointerSel = select(this.nodeRefs.pointer);
        const timelineSel = select(this.nodeRefs.timeline);

        const getScale = () => {
            const intv = this.getIntervalAbsolute();
            return scaleLinear()
                .domain([intv.from.valueOf(), intv.to.valueOf()])
                .range([this.state.axisRect.x, this.state.axisRect.x + this.state.axisRect.width])
                .clamp(true);
        };

        const movePointer = (ts) => {
            const scale = getScale();
            const pos = ts || scale.invert(mouse(this.nodeRefs.axis)[0]);
            const x = scale(pos);

            progressBarSel.attr("x2", x);
            pointerSel.attr("cx", x);

            posLabelSel.text(moment(pos).format(this.props.positionFormatString));
        };
        const stopSliding = () => {
            this.sliding = false;
            timelineSel
                .on("mouseup.sliding mouseleave.sliding mousemove.sliding", null);

            posLabelSel.style("display", "none");
            hoverPosLabelSel.style("display", "block");

            const pos = getScale().invert(mouse(this.nodeRefs.axis)[0]);
            this.props.animationControl.seek(pos);
        };
        const cancelSliding = () => {
            this.sliding = false;
            timelineSel.on("mouseup.sliding mousemove.sliding mouseleave.sliding", null);

            if (this.props.animationStatus.position !== this.state.position) {
                this.setState({position: this.props.animationStatus.position});
            } else {
                movePointer(this.state.position);
            }
        };
        const startSliding = () => {
            this.sliding = true;
            posLabelSel.style("display", "block");
            hoverPosLabelSel.style("display", "none");

            movePointer();

            timelineSel
                .on("mousemove.sliding", movePointer)
                .on("mouseup.sliding", stopSliding)
                .on("mouseleave.sliding", cancelSliding);
        };

        const updateHoverLabel = () => {
            const pos = getScale().invert(mouse(this.nodeRefs.axis)[0]);
            hoverPosLabelSel.text(moment(pos).format(this.props.positionFormatString));
        };
        const stopTrackingHover = () => {
            pointerSel.style("display", "none");
            posLabelSel.style("display", "block");
            hoverPosLabelSel.style("display", "none");

            timelineSel.on("mousemove.tracking mouseleave.tracking", null);
        };
        const startTrackingHover = () => {
            pointerSel.style("display", "block");
            posLabelSel.style("display", "none");
            hoverPosLabelSel.style("display", "block");

            updateHoverLabel();

            timelineSel
                .on("mouseleave.tracking", stopTrackingHover)
                .on("mousemove.tracking", updateHoverLabel);

        };

        timelineSel
            .attr("cursor", "pointer")
            .on("mouseenter.tracking", startTrackingHover)
            .on("mousedown.sliding", startSliding);

        pointerSel
            .attr("cursor", "pointer")
            .on("mousedown.sliding", startSliding);
    }

    disable() {
        const pointerSel = select(this.nodeRefs.pointer);
        const timelineSel = select(this.nodeRefs.timeline);
        const posLabelSel = select(this.nodeRefs.positionLabel);
        const hoverPosLabelSel = select(this.nodeRefs.hoverPositionLabel);

        this.sliding = false;

        posLabelSel.style("display", "block");
        hoverPosLabelSel.style("display", "none");

        timelineSel
            .attr("cursor", "default")
            .on("mouseenter.tracking mousedown.sliding", null);

        pointerSel
            .attr("cursor", "default")
            .style("displa", "none")
            .on("mousedown.sliding", null);
    }

    updateTicks() {
        const intv = this.getIntervalAbsolute();
        const timeScale = scaleTime()
            .domain([intv.from.toDate(), intv.to.toDate()])
            .range([this.state.axisRect.x, this.state.axisRect.x + this.state.axisRect.width]);

        //Range minus 50px padding on both sides
        const tickCount = Math.floor((timeScale.range()[1] - timeScale.range()[0] - 2*50)/ 100);
        const ticks = timeScale.ticks(tickCount);
        const tickFormat = timeScale.tickFormat();

        const axisTop = this.state.axisRect.y - this.state.axisRect.height/2;
        const axisBottom = this.state.axisRect.y + this.state.axisRect.height/2;

        const tickTop = axisTop + this.state.axisRect.height/4;
        const tickBottom = axisBottom - this.state.axisRect.height/4;

        const createTick = (sel) => {
            return sel.append("g")
                .attr("pointer-events", "none")
                .call(sel => sel.append("line")
                    .classed(styles.tick, true)
                    .classed(this.props.classNames.tick, !!this.props.classNames.tick)
                    .attr("stroke-linecap", "round")
                    .attr("y1", tickTop)
                    .attr("y2", tickBottom),
                )
                .call(sel => sel.append("text")
                    .classed(styles.tickLabel, true).classed(this.props.classNames.tickLabel, !!this.props.classNames.tickLabel)
                    .attr("text-anchor", "middle")
                    .attr("dy", "1em")
                    .attr("y", axisBottom)
                );
        };

        select(this.nodeRefs.ticks).selectAll("g")
            .data(ticks)
            .join(createTick)
            .attr("transform", d => `translate(${timeScale(d)}, 0)`)
            .call(sel => sel.select("text")
                .text(d => tickFormat(d))
            );
    }

    updateAxisRect() {
        const axisSel = select(this.nodeRefs.axis);

        const rect = this.nodeRefs.axis.getBBox();
        rect.height = axisSel.attr("stroke-width") || Number.parseInt(axisSel.style("stroke-width"), 10);

        this.setState({axisRect: rect});
    }

    render() {
        const percScale = this.getPercScale();
        const percBegin = percScale.range()[0];
        const percEnd = percScale.range()[1];
        const percPosition = percScale(this.state.position);

        return (
            <svg ref={node => this.nodeRefs.timeline = node}
                className={styles.timeline + " " + (this.props.classNames.timeline || "")}
                xmlns={"http://www.w3.org/2000/svg"}>

                <line ref={node => this.nodeRefs.axis = node}
                    className={styles.axis + " " + (this.props.classNames.axis || "")}
                    x1={percBegin} y1={"50%"}
                    x2={percEnd} y2={"50%"}
                />
                <line ref={node => this.nodeRefs.progressBar = node}
                    className={styles.progressBar + " " + (this.props.classNames.progressBar || "")}
                    pointerEvents={"none"}
                    x1={percBegin} y1={"50%"}
                    x2={percPosition} y2={"50%"}
                />

                <g ref={node => this.nodeRefs.ticks = node}/>

                <text ref={node => this.nodeRefs.positionLabel = node}
                    className={styles.positionLabel + " " + (this.props.classNames.positionLabel || "")}
                    y={(this.state.axisRect && this.state.axisRect.y) || 0} x={"50%"} dy={"-1.7em"}
                    pointerEvents={"none"}
                    textAnchor={"middle"}
                >
                    {moment(this.state.position).format(this.props.positionFormatString)}
                </text>
                <text ref={node => this.nodeRefs.hoverPositionLabel = node}
                    className={styles.hoverPositionLabel + " " + (this.props.classNames.hoverPositionLabel || "")}
                    y={(this.state.axisRect && this.state.axisRect.y) || 0} x={"50%"} dy={"-1.7em"}
                    pointerEvents={"none"}
                    textAnchor={"middle"}
                    style={{display:"none"}}
                />
                <circle ref={node => this.nodeRefs.pointer = node}
                    className={styles.pointer + " " + (this.props.classNames.pointer || "")}
                    cx={percPosition} cy={"50%"}
                    style={{display: "none"}}
                    r={(this.state.axisRect && 2*this.state.axisRect.height/3) || 0}
                />
            </svg>
        );
    }
}

class ButtonGroup extends Component {
    static propTypes = {
        playPause: PropTypes.object,
        stop: PropTypes.object,
        jumpForward: PropTypes.object,
        jumpBackward: PropTypes.object,
        changeSpeed: PropTypes.object,

        className: PropTypes.string,
    }

    constructor() {
        super();

        this.comps = {
            jumpBackward: JumpBackwardButton,
            playPause: PlayPauseButton,
            stop: StopButton,
            jumpForward: JumpForwardButton,
            changeSpeed: ChangeSpeedDropdown,
        };
    }

    render() {
        return (
            <div role={"group"}
                className={"btn-group " + styles.mediaButtonGroup + " " + (this.props.className || "")}>
                {
                    Object.keys(this.comps).filter(btnKey => btnKey in this.props && this.props[btnKey].visible).map(btnKey => {
                        const Comp = this.comps[btnKey];

                        return <Comp {...this.props[btnKey]} key={btnKey} />;
                    })
                }
            </div>
        );
    }
}

class OnelineLayout extends Component {
    static propTypes = {
        playPause: PropTypes.object,
        stop: PropTypes.object,
        jumpForward: PropTypes.object,
        jumpBackward: PropTypes.object,
        changeSpeed: PropTypes.object,
        timeline: PropTypes.object,

        buttonGroupClassName: PropTypes.string,
        layoutClassName: PropTypes.string,
    }

    render() {
        const {timeline, ...buttons} = this.props;

        const visibleButtonKeys = Object.keys(buttons).filter(buttonId => buttons[buttonId].visible);
        const visibleButtons = {};
        for (const btKey of visibleButtonKeys)
            visibleButtons[btKey] = buttons[btKey];

        return (
            <div className={
                styles.onelineLayout + " " + (this.props.layoutClassName || "")
            }>
                <div className={"row"}>
                    {visibleButtonKeys.length > 0 &&
                        <div className={"col-auto"}>
                            <ButtonGroup {...visibleButtons} className={this.props.buttonGroupClassName} />
                        </div>
                    }
                    {timeline && timeline.visible &&
                        <div className={"col"}>
                            <Timeline {...timeline} />
                        </div>
                    }
                </div>
            </div>
        );
    }
}

export {
    PlayPauseButton,
    StopButton,
    JumpForwardButton,
    JumpBackwardButton,

    ChangeSpeedDropdown,

    Timeline,

    ButtonGroup,

    OnelineLayout,
};
