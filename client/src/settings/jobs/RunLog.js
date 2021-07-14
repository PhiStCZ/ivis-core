'use strict';

import React, {Component} from "react";
import {translate} from "react-i18next";
import {Table} from "../../lib/table";
import {Panel} from "../../lib/panel";
import {
    requiresAuthenticatedUser, Toolbar,
    withPageHelpers
} from "../../lib/page";
import {Button, Icon} from "../../lib/bootstrap-components";
import {
    withAsyncErrorHandler,
    withErrorHandling
} from "../../lib/error-handling";
import moment from "moment";
import {getRunStatuses} from "./states";
import {
    tableAddDeleteButton,
    tableRestActionDialogInit,
    tableRestActionDialogRender
} from "../../lib/modals";
import {withComponentMixins} from "../../lib/decorator-helpers";
import {withTranslation} from "../../lib/i18n";
import {checkPermissions} from "../../lib/permissions";
import {HTTPMethod} from "../../lib/axios";

const {getVirtualNamespaceId} = require("../../../../shared/namespaces");

@withComponentMixins([
    withTranslation,
    withErrorHandling,
    withPageHelpers,
    requiresAuthenticatedUser
])
export default class Log extends Component {
    constructor(props) {
        super(props);

        this.state = {};
        tableRestActionDialogInit(this);

        this.runStatuses = getRunStatuses(props.t);
    }

    @withAsyncErrorHandler
    async fetchPermissions() {
        const result = await checkPermissions({
            deleteJob: {
                entityTypeId: 'job',
                requiredOperations: ['delete']
            }
        });

        this.setState({
            deletePermitted: result.data.deleteJob
        });
    }

    componentDidMount() {
        this.fetchPermissions();
    }

    render() {
        const t = this.props.t;
        const job = this.props.entity;
        const canDelete = this.state.deletePermitted && job.namespace !== getVirtualNamespaceId();

        const columns = [
            {data: 2, title: t('Started at'), render: data => moment(data).format('DD.MM.YYYY hh:mm:ss')},
            {data: 3, title: t('Finished at'), render: data => moment(data).format('DD.MM.YYYY hh:mm:ss')},
            {data: 4, title: t('Status'), render: data => this.runStatuses[data]},
            {
                actions: data => {

                    const actions = [];
                    const perms = data[5];

                    actions.push({
                        label: <Icon icon="file-alt" family="far" title={t('View run output')}/>,
                        link: `/settings/jobs/${data[1]}/log/${data[0]}`
                    });

                    if (job.namespace !== getVirtualNamespaceId()) {
                        tableAddDeleteButton(actions, this, null, `rest/jobs/${job.id}/run/${data[0]}`, data[0], t('Deleting run ...'), t('Run deleted'));
                    }
                    return {undefined, actions};
                }
            }
        ];

        let eraseButton;
        if (canDelete) {
            const eraseAll = (evt) => {
                evt.preventDefault();
                this.tableRestActionDialogData = {
                    shown: true,
                    title: t('confirmDeletion'),
                    message: t('areYouSureYouWantToEraseAllRunLogs?', {id: job.id}),
                    httpMethod: HTTPMethod.DELETE,
                    actionUrl: `rest/jobs/${job.id}/runs`,
                    actionInProgressMsg: t('Deleting runs ...'),
                    actionDoneMsg: t('Runs deleted'),
                };

                this.setState({
                    tableRestActionDialogShown: true
                });

                this.table.refresh();
            };
            eraseButton = <a href="" onClick={eraseAll}>
                <Button className="btn-danger" icon="trash-alt" label={t('Erase all logs')}/>
            </a>;
        }

        return (
            <Panel title={t('Runs for job with id ') + job.id}>
                {tableRestActionDialogRender(this)}
                <Toolbar>
                    {canDelete && eraseButton}
                </Toolbar>
                <Table ref={node => this.table = node} withHeader dataUrl={`rest/job-runs-table/${job.id}`}
                       columns={columns}/>
            </Panel>
        );
    }
}
