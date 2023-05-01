'use strict';

import React, {Component} from "react";
import {withErrorHandling} from "../lib/error-handling";
import PropTypes
    from "prop-types";
import * as d3Color from "d3-color";
import * as d3Scheme from "d3-scale-chromatic";
import * as d3Shape from "d3-shape";
import {select} from "d3-selection";
import {StaticLegend} from "./Legend";
import styles
    from './PieChart.scss';
import {withComponentMixins} from "../lib/decorator-helpers";
import {withTranslation} from "../lib/i18n";
import {PropType_d3Color, PropType_d3Color_Required} from "../lib/CustomPropTypes";

export const LegendPosition = {
    NONE: 0,
    RIGHT: 1,
    BOTTOM: 2
};

const legendStructure = [
    {
        labelAttr: 'label',
        colorAttr: 'color'
    }
];

@withComponentMixins([
    withTranslation,
    withErrorHandling
])
export class StaticPieChart extends Component {
    constructor(props) {
        super(props);

        this.state = {
            width: 0
        };

        this.resizeListener = () => this.createChart();
    }

    static propTypes = {
        config: PropTypes.shape({
            arcs: PropTypes.arrayOf(PropTypes.shape({
                label: PropTypes.string.isRequired,
                color: PropType_d3Color(),
                value: PropTypes.oneOfType([
                    PropTypes.number,
                    PropTypes.shape({
                        sigSetCid: PropTypes.string.isRequired,
                        signalCid: PropTypes.string.isRequired,
                        agg: PropTypes.string.isRequired,
                    })
                ]).isRequired
            })).isRequired
        }).isRequired,
        data: PropTypes.object,
        height: PropTypes.number.isRequired,
        margin: PropTypes.object,
        getArcColor: PropTypes.func,
        getLabelColor: PropTypes.func,
        colors: PropTypes.arrayOf(PropType_d3Color_Required()),
        arcWidth: PropTypes.number,
        drawPercentageLabels: PropTypes.bool,
        drawValueLabels: PropTypes.bool,
        legendWidth: PropTypes.number,
        legendHeight: PropTypes.number,
        legendPosition: PropTypes.number,
        legendRowClass: PropTypes.string,
        centerMessage: PropTypes.string
    }

    static defaultProps = {
        getArcColor: color => color,
        getLabelColor: color => {
            const hsl = d3Color.hsl(color);
            if (hsl.l > 0.7) {
                return d3Color.color('black');
            } else {
                return d3Color.color('white');
            }
        },
        margin: {
            left: 5,
            right: 5,
            top: 5,
            bottom: 5
        },
        legendWidth: 120,
        legendHeight: 100,
        legendRowClass: 'col-12',
        legendPosition: LegendPosition.RIGHT,
        colors: d3Scheme.schemeCategory10,
        arcWidth: 60,
        drawPercentageLabels: true,
    }

    componentDidMount() {
        window.addEventListener('resize', this.resizeListener);
        this.createChart(true);
    }

    componentDidUpdate(prevProps, prevState, prevContext) {
        const forceRefresh = this.prevContainerNode !== this.containerNode
            || prevProps.config !== this.props.config
            || this.props.data !== prevProps.data;

        this.createChart(forceRefresh);
        this.prevContainerNode = this.containerNode;
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resizeListener);
    }

    /** get arc color if it is not specified in the config */
    getColor(i) {
        return this.props.colors[i % this.props.colors.length];
    }

    createChart(forceRefresh) {
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


        const t = this.props.t;
        const innerWidth = width - this.props.margin.left - this.props.margin.right;
        const innerHeight = this.props.height - this.props.margin.top - this.props.margin.bottom;
        const radius = Math.min(innerWidth / 2, innerHeight / 2);

        const centerX = innerWidth / 2 + this.props.margin.left;
        const centerY = innerHeight / 2 + this.props.margin.top;
        this.shadowsSelection.attr('transform', `translate(${centerX},${centerY})`);
        this.pieSelection.attr('transform', `translate(${centerX},${centerY})`);
        this.labelsSelection.attr('transform', `translate(${centerX},${centerY})`);
        this.msgSelection.attr('transform', `translate(${centerX},${centerY})`);

        const entryValueAccessor = (entry) => {
            if (typeof entry.value === 'number') {
                return entry.value;
            }

            let resValue = null;
            const valObj = entry.value;
            if (this.props.data && valObj.sigSetCid && valObj.signalCid && valObj.agg) {
                resValue = this.props.data[valObj.sigSetCid][valObj.signalCid][valObj.agg];
            }

            return typeof resValue === "number" ? resValue : 0;
        };

        let total = 0;
        for (const entry of this.props.config.arcs) {
            total += entryValueAccessor(entry);
        }

        if (total === 0) {
            this.msgSelection.text('No data.');
        } else {
            this.msgSelection.text(this.props.centerMessage || null);
        }

        const pieGen = d3Shape.pie()
            .padAngle(0.02)
            .sort(null)
            .value(entryValueAccessor);

        const arcGen = d3Shape.arc()
            .outerRadius(radius)
            .innerRadius(radius - this.props.arcWidth);

        const shadows = this.shadowsSelection.selectAll('path').data(pieGen(this.props.config.arcs));
        shadows.enter().append('path')
            .merge(shadows)
            .attr('d', arcGen)
            .attr('filter', 'url(#shadow)')
            .attr('fill', 'rgba(0,0,0, 0.3)');
        shadows.exit().remove();

        const arcs = this.pieSelection.selectAll('path').data(pieGen(this.props.config.arcs));
        arcs.enter().append('path')
            .merge(arcs)
            .attr('d', arcGen)
            .attr('fill', d => this.props.getArcColor(d.data.color));
        arcs.exit().remove();

        const labels = this.labelsSelection.selectAll('text').data(pieGen(this.props.config.arcs));
        if (this.props.drawPercentageLabels || this.props.drawValueLabels) {
            labels.enter().append('text')
                .merge(labels)
                .attr('transform', d => `translate(${arcGen.centroid(d)})`)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('class', styles.label)
                .attr('fill', d => this.props.getLabelColor(d.data.color))
                .text(d => {
                    const ratio = Math.floor(d.data.value * 100 / total);
                    if (ratio <= 5) return '';
                    return this.props.drawPercentageLabels ? `${ratio}%` : d.data.value;
                })
        }
        labels.exit().remove();
    }

    render() {
        for (const [i, arc] of this.props.config.arcs.entries()) {
            if (!arc.hasOwnProperty("color"))
                arc.color = this.getColor(i);
        }

        return (
            <div>
                <svg className={styles.pie} ref={node => this.containerNode = node} height={this.props.height} width="100%">
                    <defs>
                        <filter id="shadow">
                            <feOffset result="offOut" in="SourceGraphic" dx="2" dy="2" />
                            <feGaussianBlur result="blurOut" in="offOut" stdDeviation="2" />
                        </filter>
                    </defs>
                    <text ref={node => this.msgSelection = select(node)} fill="black" textAnchor="middle"/>
                    <g ref={node => this.shadowsSelection = select(node)} />
                    <g ref={node => this.pieSelection = select(node)} />
                    <g ref={node => this.labelsSelection = select(node)} />

                    {this.props.legendPosition === LegendPosition.RIGHT &&
                    <g>
                        <foreignObject requiredFeatures="http://www.w3.org/TR/SVG11/feature#Extensibility" width={this.props.legendWidth} height={this.props.height} x={this.state.width - this.props.margin.right - this.props.legendWidth} y={this.props.margin.top}>
                            <StaticLegend config={this.props.config.arcs} structure={legendStructure} className={`${styles.legend} ${styles.legendRight}`} rowClassName={this.props.legendRowClass}/>
                        </foreignObject>
                    </g>
                    }
                </svg>
                {this.props.legendPosition === LegendPosition.BOTTOM &&
                    <StaticLegend config={this.props.config.arcs} structure={legendStructure} className={`${styles.legend} ${styles.legendBottom}`} rowClassName={this.props.legendRowClass}/>
                }
            </div>
        );
    }
}
