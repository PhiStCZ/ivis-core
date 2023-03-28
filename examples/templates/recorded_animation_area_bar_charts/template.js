'use strict';

import React, {Component} from 'react';
import moment from 'moment';
import {
    RecordedAnimation,
    PlayPauseButton,
    Timeline,
    ChangeSpeedDropdown,
    animated,
    AreaChart,
    SimpleBarChart,
    StaticLegend,
    withPanelConfig,
    linearInterpolation,
    cubicInterpolation,
    TimeRangeSelector,
    IntervalSpec
} from 'ivis';
import PropTypes from 'prop-types';

import styles from './styles.scss';

const AnimatedAreaChart = animated(AreaChart);
const AnimatedBarChart = animated(SimpleBarChart);

const areaChartDtSourceKey = 'areachart_dt';
const barChartDtSourceKey = 'barchart_dt';

class AreaChartSection extends Component {
    static propTypes = {
        config: PropTypes.object.isRequired,
    }

    render() {
        return (
            <div className="container-fluid">
                <AnimatedAreaChart
                    dataSourceKey={areaChartDtSourceKey}
                    config={{
                        yAxes: [{
                            visible: true,
                            belowMin: 0.1,
                            aboveMax: 0.2
                        }],
                        signalSets: this.props.config.sigSets,
                    }}
                    height={500}
                />
            </div>
        );
    }
}
class BarChartSection extends Component {
    static propTypes = {
        categories: PropTypes.array,
        dataSets: PropTypes.array,

        domainLabel: PropTypes.string,
        codomainLabel: PropTypes.string,

        valueFormatSpecifier: PropTypes.string,
    }

    getBarChartConfig() {
        const config = {
            groups: [],
        };

        const colors = {};
        for (const cat of this.props.categories) {
            colors[cat.id] = cat.color;
        }

        for (const dataSet of this.props.dataSets) {
            const group = {
                label: dataSet.name,
                colors: dataSet.categories.map(c => colors[c.categoryId]),
                values: dataSet.categories.map(c => ({
                    sigSetCid: dataSet.sigSetCid,
                    signalCid: c.cid,
                    agg: 'avg'
                })),
            };

            config.groups.push(group);
        }

        return config;
    }

    render() {
        const structure = [
            {
                labelAttr: 'label',
                colorAttr: 'color',
            },
        ];
        const isHorizontal = this.props.dataSets.length > 4;
        const height = isHorizontal ?
            this.props.dataSets.length * this.props.categories.length * 35 :
            600;

        return (
            <div className="px-1 text-center">
                <AnimatedBarChart
                    dataSourceKey={barChartDtSourceKey}
                    height={height}
                    padding={{
                        bottom: 30,
                        top: 10,
                        left: 100,
                        right: 70,
                    }}
                    isHorizontal={isHorizontal}
                    domainLabel={this.props.domainLabel}
                    codomainLabel={this.props.codomainLabel}
                    config={this.getBarChartConfig()}

                    withTickLines
                    withBarValues

                    valueFormatSpecifier={this.props.valueFormatSpecifier}
                />

                <StaticLegend
                    structure={structure}
                    config={this.props.categories}
                    rowClassName={"col " + styles.legendRow}
                    />
            </div>
        );
    }
}

@withPanelConfig
export default class Panel extends Component {
    getAnimationConfig() {
        const ac = this.getPanelConfig(['animationConfig']);
        const dataSources = {};

        const barChartDtSets = this.getPanelConfig(['barchart', 'dataSets']);
        dataSources[barChartDtSourceKey] = {
            type: 'generic',
            interpolation: linearInterpolation,

            sigSets: barChartDtSets.map(dtSet => ({
                cid: dtSet.sigSetCid,
                tsSigCid: dtSet.tsSigCid,
                signals: dtSet.categories
            })),
        };

        const areaChartSigSets  = this.getPanelConfig(
            ['areachart', 'sigSets']
        );

        dataSources[areaChartDtSourceKey] = {
            type: 'timeSeries',
            interpolation: cubicInterpolation,

            signalAggs: ['max'],
            sigSets: areaChartSigSets,
        }

        return { dataSources };
    }

    render() {
        const heightStyle = { height: "25px" };

        const barChartConf = this.getPanelConfig(['barchart']);

        return (
            <RecordedAnimation {...this.getAnimationConfig()}>
                <TimeRangeSelector />
                <div className="row py-3">
                    <div className="btn-group col-auto" style={heightStyle}>
                        <PlayPauseButton enabled />
                        <ChangeSpeedDropdown enabled />
                    </div>

                    <div className="col" style={heightStyle}>
                        <Timeline enabled />
                    </div>
                </div>

                <AreaChartSection
                    config={this.getPanelConfig(['areachart'])}
                />
                <hr />
                <BarChartSection
                    domainLabel={barChartConf.domainLabel}
                    codomainLabel={barChartConf.codomainLabel}
                    valueFormatSpecifier={barChartConf.valueFormatSpecifier}
                    categories={barChartConf.categories}
                    dataSets={barChartConf.dataSets}
                    />
            </RecordedAnimation>
        );
    }
}
