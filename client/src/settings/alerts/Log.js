'use strict';

import React, {Component} from "react";
import PropTypes from "prop-types";
import {Table} from "../../lib/table";
import {Panel} from "../../lib/panel";
import {
    requiresAuthenticatedUser,
    Toolbar,
    withPageHelpers
} from "../../lib/page";
import {
    withErrorHandling
} from "../../lib/error-handling";
import {
    tableRestActionDialogInit,
    tableRestActionDialogRender
} from "../../lib/modals";
import {withComponentMixins} from "../../lib/decorator-helpers";
import {withTranslation} from "../../lib/i18n";
import {Button, RelativeTime} from "../../lib/bootstrap-components";
import {CSVLink} from "react-csv";
import axios from "../../lib/axios";
import {getUrl} from "../../lib/urls";
import moment from "moment";

@withComponentMixins([
    withTranslation,
    withErrorHandling,
    withPageHelpers,
    requiresAuthenticatedUser
])
export default class Log extends Component {
    constructor(props) {
        super(props);

        this.state = {CSVData: ""};
        this.CSVRef = React.createRef();
        tableRestActionDialogInit(this);
    }

    static propTypes = {
        alertId: PropTypes.number.isRequired
    }

    async fetchCSV() {
        const response = await axios.get(getUrl(`rest/alerts-log-simple-table/${this.props.alertId}`));
        let tmp = [];
        response.data.forEach(item => tmp.push({time: moment(item.time).format('YYYY-MM-DD HH:mm:ss'), type: item.type}));
        this.setState({CSVData: tmp});
        this.CSVRef.current.link.click();
    }

    render() {
        const t = this.props.t;

        const columns = [
            { data: 1, title: t('Time'), render: data => <RelativeTime timeStamp={data} thresholdDays={7} /> },
            { data: 0, title: t('Type'), render: data => {if (data === 'test') return t('Tested');
                                                          if (data === 'trigger') return t('Triggered');
                                                          if (data === 'revoke') return t('Revoked');
                                                          if (data === 'init') return t('Initialized');
                                                          if (data === 'update') return t('Updated');
                                                          if (data === 'interval') return t('Interval exceeded');
                                                          if (data === 'triggerAndRevoke') return t('Triggered and revoked');
                                                          return data;} }
        ];
        return (
            <Panel title={t('Alerts log')}>
                {tableRestActionDialogRender(this)}
                <Toolbar>
                    <CSVLink data={this.state.CSVData} filename={`alert-${this.props.alertId}-log.csv`} ref={this.CSVRef} hidden />
                    <Button className="btn-primary" icon="file-download" label={t('Download as CSV')} onClickAsync={this.fetchCSV.bind(this)} />
                </Toolbar>
                <Table ref={node => this.table = node} withHeader dataUrl={`rest/alerts-log-table/${this.props.alertId}`} columns={columns} />
            </Panel>
        );
    }
}
