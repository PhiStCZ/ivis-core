'use strict';

import React, { Component } from "react";
import { translate } from "react-i18next";
import { Panel } from "../../lib/panel";
import { NavButton, requiresAuthenticatedUser, Toolbar, withPageHelpers } from "../../lib/page";
import { Icon } from "../../lib/bootstrap-components";
import axios from "../../lib/axios";
import { withAsyncErrorHandler, withErrorHandling } from "../../lib/error-handling";
import moment from "moment";
import { rgb } from "d3-color";
import { LineChart } from "../../ivis/LineChart";
import { TimeRangeSelector } from "../../ivis/TimeRangeSelector";
import { TimeContext, withIntervalAccess } from "../../ivis/TimeContext";
import { IntervalAbsolute } from "../../ivis/TimeInterval";

@translate()
@withPageHelpers
@withErrorHandling
@requiresAuthenticatedUser
export default class FarmSensors extends Component {
    constructor(props) {
        super(props);

        this.state = {
            configs: {}
        };

        this.colors = [rgb(70, 130, 180), rgb(170, 30, 80), rgb(70, 230, 10), rgb(17, 130, 100)];
    }

    @withAsyncErrorHandler
    async componentDidMount() {
        const t = this.props.t;
        const result = await axios.get(`/rest/farmsensors/${this.props.farm.id}`);
        const sensors = result.data;

        let signalSetsDic = {};
        let signalSetsConfig = {};

        for (const sensor of sensors) {
            if (signalSetsDic.hasOwnProperty(sensor.ssCid) === false) {
                signalSetsDic[sensor.ssCid] = [];
            }

            signalSetsDic[sensor.ssCid].push(sensor.sCid);
        }

        for (const ssCid in signalSetsDic) {
            let signalSetDic = { cid: ssCid, signals: [] };
            let idxColor = 0;

            for (const sigCid of signalSetsDic[ssCid])
                signalSetDic.signals.push({
                    cid: sigCid,
                    label: t(ssCid + ':' + sigCid),
                    color: this.colors[idxColor++ % 4]
                });

            signalSetsConfig[ssCid] = {
                config: {
                    yScale: {
                        includedMin: 0,
                        includedMax: 1000
                    },
                    signalSets: [signalSetDic]
                }
            }
        }

        this.setState({ configs: signalSetsConfig });
    }

    render() {
        const t = this.props.t;

        return (
            <Panel title={t(this.props.farm.name + '\'s Farm Sensors Graphs')}>
                {this.renderSensorGraphs(this.state.configs)}
            </Panel>

        );
    }

    renderSensorGraphs(configs) {
        let graphs = []
        for (const sensor in configs) {
            const config = configs[sensor].config;
            graphs.push(this.lineChartGraph(sensor, config));
        }

        return graphs;
    }

    lineChartGraph(sensor, config) {
        const t = this.props.t;

        return (
            <Panel title={t('Sensor ' + sensor)} key={sensor}>
                <TimeContext>
                    <div className="row">
                        <div className="col-xs-12">
                            <TimeRangeSelector />
                        </div>
                        <div className="col-xs-12">
                            <div>
                                <LineChart
                                    onClick={(selection, position) => { console.log(selection); console.log(position); }}
                                    config={config}
                                    height={500}
                                    margin={{ left: 40, right: 5, top: 5, bottom: 20 }}
                                />
                            </div>
                        </div>
                    </div>
                </TimeContext>
            </Panel>
        );
    }
}