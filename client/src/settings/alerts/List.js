'use strict';

import React, {Component} from "react";
import {Table} from "../../lib/table";
import {Panel} from "../../lib/panel";
import {
    LinkButton,
    requiresAuthenticatedUser,
    Toolbar,
    withPageHelpers
} from "../../lib/page";
import {Icon, RelativeTime} from "../../lib/bootstrap-components";
import {
    withAsyncErrorHandler,
    withErrorHandling
} from "../../lib/error-handling";
import {checkPermissions} from "../../lib/permissions";
import {
    tableAddDeleteButton,
    tableRestActionDialogInit,
    tableRestActionDialogRender
} from "../../lib/modals";
import {withComponentMixins} from "../../lib/decorator-helpers";
import {withTranslation} from "../../lib/i18n";

@withComponentMixins([
    withTranslation,
    withErrorHandling,
    withPageHelpers,
    requiresAuthenticatedUser
])
export default class List extends Component {
    constructor(props) {
        super(props);

        this.state = {};
        tableRestActionDialogInit(this);
    }

    @withAsyncErrorHandler
    async fetchPermissions() {
        const result = await checkPermissions({
            createAlert: {
                entityTypeId: 'namespace',
                requiredOperations: ['createAlert']
            }
        });

        this.setState({
            createPermitted: result.data.createAlert
        });
    }

    componentDidMount() {
        this.fetchPermissions();
    }

    render() {
        const t = this.props.t;

        const columns = [
            { data: 1, title: t('Name') },
            { data: 2, title: t('Description') },
            { data: 3, title: t('Enabled'), render: data => data === 1 ? t('Yes') : t('No') },
            { data: 4, title: t('Created'), render: data => <RelativeTime timeStamp={data} /> },
            { data: 5, title: t('Signal set') },
            { data: 6, title: t('Namespace') },
            { title: t('Actions'),
                actions: data => {
                    const actions = [];
                    const perms = data[7];

                    if (perms.includes('edit')) {
                        actions.push({
                            label: <Icon icon="edit" title={t('Edit')}/>,
                            link: `/settings/alerts/${data[0]}/edit`
                        });
                    }

                    if (perms.includes('view')) {
                        actions.push({
                            label: <Icon icon="book" title={t('Log')}/>,
                            link: `/settings/alerts/${data[0]}/log`
                        })
                    }

                    if (perms.includes('share')) {
                        actions.push({
                            label: <Icon icon="share" title={t('Share')}/>,
                            link: `/settings/alerts/${data[0]}/share`
                        });
                    }

                    tableAddDeleteButton(actions, this, perms, `rest/alerts/${data[0]}`, data[1], t('Deleting alert ...'), t('Alert deleted'));

                    return actions;
                }
            }
        ];

        return (
            <Panel title={t('Alerts')}>
                {tableRestActionDialogRender(this)}
                    <Toolbar>
                        <LinkButton to="/settings/alerts/create" className="btn-primary" icon="plus" label={t('Create Alert')}/>
                    </Toolbar>
                <Table ref={node => this.table = node} withHeader dataUrl="rest/alerts-table" columns={columns} />
            </Panel>
        );
    }
}
