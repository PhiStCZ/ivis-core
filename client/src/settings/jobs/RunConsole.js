'use strict';

import React, {Component} from "react";
import {translate} from "react-i18next";
import {Panel} from "../../lib/panel";
import {
    requiresAuthenticatedUser,
    withPageHelpers
} from "../../lib/page";
import {
    withErrorHandling
} from "../../lib/error-handling";
import {withComponentMixins} from "../../lib/decorator-helpers";
import {withTranslation} from "../../lib/i18n";
import developStyles from "../tasks/Develop.scss";
import {RunStatus} from "../../../../shared/jobs";
import {getUrl} from "../../lib/urls";
import PropTypes from "prop-types";

@withComponentMixins([
    withTranslation,
    withErrorHandling,
    withPageHelpers,
    requiresAuthenticatedUser
])
export default class RunConsole extends Component {
    static propTypes = {
        runId: PropTypes.number.isRequired,
        jobId: PropTypes.number.isRequired
    }

    constructor(props) {
        super(props);

        this.state = {};
    }

    componentDidMount() {
        this.initRunEventSource(this.props.runId);

        this.setState({
            runStatus: RunStatus.INITIALIZATION,
            chunkCounter: 0
        });
    }

    initRunEventSource() {
        this.runOutputChunks = [];
        this.runEventSource = new EventSource(getUrl(`sse/jobs/${this.props.jobId}/run/${this.props.runId}`));
        this.runEventSource.addEventListener("changeRunStatus", (e) => {
            this.state.runStatus = e.data;
        });

        this.runEventSource.addEventListener("init", (e) => {
            const run = JSON.parse(e.data);

            let counter = this.state.chunkCounter;
            this.runOutputChunks.push({
                id: counter++,
                data: run.output
            });

            this.setState({
                runStatus: run.status,
                chunkCounter: counter
            });
        });


        this.runEventSource.addEventListener("output", (e) => {
            if (e.origin + '/' !== getUrl()) {
                console.warn(`Origin ${e.origin} not allowed; only events from ${getUrl()}`);
            } else {
                const data = JSON.parse(e.data);

                let counter = this.state.chunkCounter;
                if (Array.isArray(data)) {
                    data.forEach(d => {
                        this.runOutputChunks.push({
                            id: counter++,
                            data: d
                        });
                    })
                } else {
                    this.runOutputChunks.push({
                        id: counter++,
                        data: data
                    });
                }

                this.setState({
                    chunkCounter: counter
                });
            }
        });

        this.runEventSource.addEventListener("success", (e) => {
            this.setState({
                runStatus: RunStatus.SUCCESS
            });
            this.closeRunEventSource();
        });
        this.runEventSource.addEventListener("stop", (e) => {

            this.runOutputChunks.push({
                id: this.state.chunkCounter,
                data: `ERROR: Run has been stopped`
            });

            this.setState({
                runStatus: RunStatus.FAILED,
                chunkCounter: this.state.chunkCounter + 1
            });
            this.closeRunEventSource();
        });

        this.runEventSource.onmessage = function (e) {
            //console.log(e.data);
        }

        this.runEventSource.onerror = (e) => {
            console.log(e);
            this.runOutputChunks.push({
                id: this.state.chunkCounter,
                data: `ERROR: ${JSON.parse(e.data)}`
            });
            this.setState({
                chunkCounter: this.state.chunkCounter + 1
            });
            this.stop();
        };
    }

    closeRunEventSource() {
        if (this.runEventSource) {
            this.runEventSource.close();
            this.runEventSource = null;
        }
    }

    render() {
        const t = this.props.t;

        let runStatusElement = null;
        const status = this.state.runStatus;


        if (status == null) {
            runStatusElement = (
                <div className='p-1 text-info'>{t('Loading...')}</div>
            );
        } else {
            switch (status) {
                case (RunStatus.INITIALIZATION):
                case (RunStatus.SCHEDULED):
                    runStatusElement = (
                        <div className='p-1 text-info'>{t('Loading...')}</div>
                    );
                    break;
                case (RunStatus.RUNNING):
                    runStatusElement = (
                        <div className='p-1 text-info'>{t('Running...')}</div>
                    );
                    break;
                case (RunStatus.FAILED):
                    runStatusElement = (
                        <div className='p-1 text-danger'>{t('Finished with error')}</div>
                    );
                    break;
                case (RunStatus.SUCCESS):
                    runStatusElement = (
                        <div className='p-1 text-success'>{t('Finished successfully')}</div>
                    );
                    break;
            }

        }

        let runOutput = "";
        if (this.runOutputChunks && (this.runOutputChunks.length > 0)) {
            runOutput = this.runOutputChunks.map((output) => {
                return <span key={output.id}>{output.data}</span>
            });
        }
        return (
            <>
                <div className={developStyles.integrationTabRunStatus}>
                    {runStatusElement}
                </div>
                <div className={developStyles.integrationTabRunOutput}>
                    <pre>
                        <code>
                            {runOutput}
                        </code>
                    </pre>
                </div>
            </>
        );
    }
}