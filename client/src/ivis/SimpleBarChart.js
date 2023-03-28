import PropTypes from "prop-types";
import React, {Component} from "react";
import {max, extent, range} from "d3-array";
import {scaleBand, scaleLinear} from "d3-scale";
import {axisBottom, axisLeft} from "d3-axis";
import {select} from "d3-selection";

import styles from "./SimpleBarChart.scss";

export class SimpleBarChart extends Component {
    static propTypes = {
        config: PropTypes.object.isRequired,
        data: PropTypes.object,

        codomainLabel: PropTypes.string,
        domainLabel: PropTypes.string,
        barPadding: PropTypes.number, //between 0 and 1
        groupPadding: PropTypes.number, //between 0 and 1

        withTickLines: PropTypes.bool,
        withBarValues: PropTypes.bool,
        isHorizontal: PropTypes.bool,

        valueFormatSpecifier: PropTypes.string,

        padding: PropTypes.object,
        width: PropTypes.number,
        height: PropTypes.number,
        classNames: PropTypes.object,
    }

    static defaultProps = {
        classNames: {},
        padding: {
            left: 40,
            right: 40,
            top: 20,
            bottom: 40,
        },

        barPadding: 0.05,
        groupPadding: 0.2,
    }

    constructor(props) {
        super(props);

        this.state = {
            width: props.width || null,
            height: props.height || null,
        };

        this.resizeListener = ::this.updateBoundingRect;
        this.nodeRefs = {};
    }

    componentDidUpdate() {
        this.renderChart();
    }

    componentDidMount() {
        if (this.state.width && this.state.height) this.renderChart();

        this.resizeListener();
        window.addEventListener('resize', this.resizeListener);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resizeListener);
    }

    updateBoundingRect() {
        const rect = this.nodeRefs.container.getClientRects()[0];
        this.setState({
            width: rect.width,
            height: rect.height,
        });
    }

    getHeight() {
        return this.state.height - this.props.padding.top - this.props.padding.bottom;
    }

    getWidth() {
        return this.state.width - this.props.padding.left - this.props.padding.right;
    }

    getRealSpaceFunc() {
        //realSpace function helps abstract the possible rotation of the chart.
        //This helps the chart-generating code to stay clean.

        const isH = this.props.isHorizontal;

        function Point(realX, realY) {
            this.realX = realX;
            this.realY = realY;
        }

        Point.prototype.toString = function() {return `${this.realX}, ${this.realY}`;};
        Point.prototype.x = function() {return this.realX;};
        Point.prototype.y = function() {return this.realY;};

        const realSpace = (x, y) => {
            if (isH) return new Point(y, x);
            else return new Point(x, y);
        };

        realSpace.ifH = (ifHorizontal, ifNotHorizontal) => isH ? ifHorizontal : ifNotHorizontal;

        realSpace.x = {
            range: isH ? [this.getHeight(), 0] : [0, this.getWidth()],
            name: isH ? "y" : "x",
            axis: isH ? axisLeft : axisBottom,
            axisNode: isH ? this.nodeRefs.leftAxis : this.nodeRefs.bottomAxis,
        };

        realSpace.y = {
            range: isH ? [0, this.getWidth()] : [this.getHeight(), 0],
            name: isH ? "x" : "y",
            axis: isH ? axisBottom : axisLeft,
            axisNode: isH ? this.nodeRefs.bottomAxis : this.nodeRefs.leftAxis,
        };

        return realSpace;
    }

    renderChart() {
        const data = this.props.data;
        const config = this.props.config;

        const getRawValue = (value) => {
            if (typeof value === "number") return value;
            else {
                let resValue = null;
                if (data && value.sigSetCid && value.signalCid && value.agg) {
                    resValue = data[value.sigSetCid][value.signalCid][value.agg];
                }

                return resValue;
            }
        };

        const valueAccessor = (value) => {
            const rawValue = getRawValue(value);
            return typeof rawValue === "number" ? rawValue : 0;
        };

        const [minValue, maxValue] = extent([].concat(...config.groups.map(group => group.values)), valueAccessor);
        const maxSubgroups = max(config.groups.map(group => group.values.length));

        const rs = this.getRealSpaceFunc();


        const x = scaleBand()
            .domain(rs.ifH(range(config.groups.length).reverse(), range(config.groups.length)))
            .range(rs.x.range)
            .padding(this.props.groupPadding);

        let domainMax = config.yAxis && config.yAxis.includeMax ?
            Math.max(maxValue, config.yAxis.includeMax) : maxValue;
        let domainMin = config.yAxis && config.yAxis.includeMin ?
            Math.min(minValue, config.yAxis.includeMin) : minValue;

        const domainWidth = domainMax - domainMin;

        if (config.yAxis && config.yAxis.belowMin) {
            domainMin -= domainWidth * config.yAxis.belowMin;
        }

        if (config.yAxis && config.yAxis.aboveMax) {
            domainMax += domainWidth * config.yAxis.aboveMax;
        }

        const y = scaleLinear()
            .domain([domainMin, domainMax])
            .range(rs.y.range);

        const valueFormatIfDef = this.props.valueFormatSpecifier ?
            y.tickFormat(y.ticks(), this.props.valueFormatSpecifier) :
            y.tickFormat()
        ;

        const valueFormat = (value) => {
            const rawValue = getRawValue(value);
            if (rawValue === null) return "No data";
            else return valueFormatIfDef(rawValue);
        };

        const xSubgroups = scaleBand()
            .domain(range(maxSubgroups))
            .range([0, x.bandwidth()])
            .padding(this.props.barPadding);


        select(rs.x.axisNode)
            .call(rs.x.axis(x).tickFormat(idx => config.groups[idx].label));

        select(rs.y.axisNode)
            .call(rs.y.axis(y).tickFormat(valueFormatIfDef))
            .call(sel => sel.selectAll(".tickLine").remove())
            .selectAll(".tick line").clone().classed("tickLine", true)
            .attr(rs.x.name + "2", x.range()[1] - x.range()[0])
            .attr("stroke-opacity", this.props.withTickLines ? 0.1 : 0);


        const drawBars = rs.ifH(::this.drawHorizontalBars, ::this.drawVerticalBars);

        drawBars(x, y, xSubgroups, valueAccessor, valueFormat, config.groups);
    }

    drawHorizontalBars(x, y, xSubgroups, valueAccessor, valueFormat, groups) {
        const createBar = (sel) => sel.append("g").classed("bar", true)
            .call(sel => sel.append("rect"))
            .call(sel => sel.append("text")
                .attr("font-size", 10)
                .attr("font-family", "sans-serif")
                .attr("font-weight", "bold")
            );

        select(this.nodeRefs.bars).selectAll(".group")
            .data(groups)
            .join(sel => sel.append("g").classed("group", true))
            .attr("transform", (d, idx) => `translate(0, ${x(idx)})`)
            .selectAll(".bar")
            .data(d => d.values.map((value, idx) => ({value, color: d.colors[idx]})))
            .join(createBar)
            .attr("transform", (d, idx) => `translate(1,${xSubgroups(idx)})`)
            .call(sel => sel.select("rect")
                .attr("fill", d => d.color)
                .attr("height", xSubgroups.bandwidth())
                .attr("width", d => y(valueAccessor(d.value)))
            )
            .call(sel => sel.select("text")
                .text(d => valueFormat(d.value))
                .attr("y", xSubgroups.bandwidth()/2)
                .attr("x", d => y(valueAccessor(d.value)))
                .attr("dx", "1em")
                .attr("dominant-baseline", "middle")
                .attr("text-anchor", "start")
                .attr("opacity", this.props.withBarValues ? 1 : 0)
            );
    }

    drawVerticalBars(x, y, xSubgroups, valueAccessor, valueFormat, groups) {
        const createBar = (sel) => sel.append("g").classed("bar", true)
            .call(sel => sel.append("rect"))
            .call(sel => sel.append("text")
                .attr("font-size", 10)
                .attr("font-family", "sans-serif")
                .attr("font-weight", "bold")
            );

        select(this.nodeRefs.bars).selectAll(".group")
            .data(groups)
            .join(sel => sel.append("g").classed("group", true))
            .attr("transform", (d, idx) => `translate(${x(idx)}, 0)`)
            .selectAll(".bar")
            .data(d => d.values.map((value, idx) => ({value, color: d.colors[idx]})))
            .join(createBar)
            .attr("transform", (d, idx) => `translate(${xSubgroups(idx)}, ${y(valueAccessor(d.value))})`)
            .call(sel => sel.select("rect")
                .attr("fill", d => d.color)
                .attr("width", xSubgroups.bandwidth())
                .attr("height", d => y.range()[0] - y(valueAccessor(d.value)))
            )
            .call(sel => sel.select("text")
                .text(d => valueFormat(d.value))
                .attr("x", xSubgroups.bandwidth()/2)
                .attr("dy", "-2em")
                .attr("dominant-baseline", "baseline")
                .attr("text-anchor", "middle")
                .attr("opacity", this.props.withBarValues ? 1 : 0)
            );
    }

    render() {
        const height = this.getHeight();
        const width = this.getWidth();

        return (
            <>
                <svg className={styles.simpleBarChart + " " + (this.props.classNames.container || "")}
                    width={this.props.width} height={this.props.height}
                    ref={node => this.nodeRefs.container = node} xmlns={"http://www.w3.org/2000/svg"}>

                    <g ref={node => this.nodeRefs.content = node}
                        transform={`translate(${this.props.padding.left}, ${this.props.padding.top})`}>

                        <g ref={node => this.nodeRefs.leftAxis = node}>
                            <text className={styles.y_axisLabel} dx={"0.3em"}>
                                {this.props.isHorizontal ? this.props.domainLabel : this.props.codomainLabel}
                            </text>
                        </g>
                        <g ref={node => this.nodeRefs.bottomAxis = node} transform={`translate(0,${height})`}>
                            <text className={styles.x_axisLabel}
                                dy={"-0.3em"} x={width}>
                                {this.props.isHorizontal ? this.props.codomainLabel : this.props.domainLabel}
                            </text>
                        </g>

                        <g ref={node => this.nodeRefs.bars = node} />

                    </g>
                </svg>
            </>
        );
    }
}
