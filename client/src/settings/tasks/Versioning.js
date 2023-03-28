'use strict';

import React, {Component} from "react";
import PropTypes from "prop-types";
import {
    AlignedRow,
    Button,
    ButtonRow,
    Form,
    FormSendMethod,
    InputField,
    TableSelect,
    TextArea,
    withForm
} from "../../lib/form";
import {Table} from "../../lib/table";
import {requiresAuthenticatedUser, withPageHelpers} from "../../lib/page";
import {withAsyncErrorHandler, withErrorHandling} from "../../lib/error-handling";
import axios from "../../lib/axios";
import {getUrl} from "../../lib/urls";
import {withComponentMixins} from "../../lib/decorator-helpers";
import {withTranslation} from "../../lib/i18n";
import {Panel} from "../../lib/panel";
import {ModalDialog} from "../../lib/bootstrap-components";
import {Icon} from "../../lib/bootstrap-components";
import moment from "moment";
import styles from "./Versioning.scss";

@withComponentMixins([
    withTranslation,
    withErrorHandling,
    withForm,
    withPageHelpers,
    requiresAuthenticatedUser
])
export default class Versioning extends Component {
    constructor(props) {
        super(props);

        this.state = {
            data: [],
            commitHash: null,
            committing: false,
            commitMessage: '',
            remoteUrl: ''
        };

    }

    static propTypes = {
        entity: PropTypes.object.isRequired,
    }

    async commit() {
        const t = this.props.t;

        try {
            this.setFlashMessage('info', t('Committing...'));
            await axios.post(getUrl(`rest/task-vcs/${this.props.entity.id}/commit`), {
                commitMessage: this.state.commitMessage || "building"
            });
            this.setFlashMessage('success', t('Commit finished'));
            this.fetch();
        } catch (err) {
            this.setFlashMessage('danger', t('Commit failed') + ' ' + err.message);
        } finally {
            this.setState({committing: false})
        }
    }

    componentDidMount() {
        this.fetch();
        this.getRemotes();
    }

    async getRemotes(){
        const url = `/rest/task-vcs/${this.props.entity.id}/remote`;
        const res = await axios.get(url);
        const remotes = res.data
        if (remotes.length > 0) {
            this.setState({remoteUrl: remotes[0].refs.fetch})
        }
    }

    @withAsyncErrorHandler
    async fetch() {
        const url = `/rest/task-vcs/${this.props.entity.id}`;
        const res = await axios.get(url);
        const data = res.data.map(d => [d.hash, d.msg, d.date]);
        this.setState({data: data});
    }

    @withAsyncErrorHandler
    async checkout() {
        const result = await axios.post(getUrl(`rest/task-vcs/${this.props.entity.id}/checkout/${this.state.commitHash}`));
        await this.unselectCommit();
        this.fetch();
    }

    async selectCommit(hash) {
        this.setState({commitHash: hash})
    }

    async unselectCommit() {
        this.setState({commitHash: null})
    }

    @withAsyncErrorHandler
    async saveRemote(){
        await axios.post(getUrl(`rest/task-vcs/${this.props.entity.id}/remote`), {
            remoteUrl: this.state.remoteUrl
        });

    }

    @withAsyncErrorHandler
    async remotePull(){
        await axios.post(getUrl(`rest/task-vcs/${this.props.entity.id}/pull`));
    }

    @withAsyncErrorHandler
    async remotePush(){
        await axios.post(getUrl(`rest/task-vcs/${this.props.entity.id}/push`));
    }

    render() {
        const t = this.props.t;

        const columns = [
            {data: 0, title: t('Hash'), orderable: false},
            {data: 1, title: t('Message'), orderable: false},
            {
                data: 2,
                title: t('Timestamp'),
                //type: 'date',
                render: data => moment(data).toISOString(),
            },
            {
                actions: data => {
                    const actions = [];

                    actions.push({
                        label: <Icon icon="code-branch" title={t('Checkout')}/>,
                        action: (table) => this.selectCommit(data[0])
                    });

                    return actions;
                }
            }
        ];

        const checkoutModalData = {
            props: {
                title: t('Confirm checkout'),
                onCloseAsync: ::this.unselectCommit,
                buttons: [
                    {label: t('no'), className: 'btn-primary', onClickAsync: ::this.unselectCommit},
                    {label: t('yes'), className: 'btn-success', onClickAsync: ::this.checkout}
                ],
            },
            content: t('areYouSureYouWantToCheckout?', {hash: this.state.commitHash})
        }

        const commitModalData = {
            props: {
                title: t('Commit'),
                onCloseAsync: ::this.unselectCommit,
                buttons: [
                    {
                        label: t('cancel'),
                        className: 'btn-primary',
                        onClickAsync: () => this.setState({committing: false})
                    },
                    {label: t('commit'), className: 'btn-success', onClickAsync: ::this.commit}
                ],
            },
            content: (
                <div className="form-group row">
                    <label className="col-sm-2 col-form-label">Message</label>
                    <div className="col-sm-10 ">
                        <textarea id="message"
                                  className="form-control"
                                  aria-describedby="form_message_help"
                                  value={this.state.commitMessage}
                                  onChange={(e) => this.setState({commitMessage: e.target.value})}
                        />
                        <small className="form-text text-muted" id="form_message_help">Commit message</small>
                    </div>
                </div>
            )
        }

        const modalData = this.state.committing ? commitModalData : checkoutModalData;
        const modalHidden = this.state.commitHash === null && this.state.committing === false;
        return (
            <Panel>
                <ModalDialog
                    hidden={modalHidden}
                    {...modalData.props}
                >
                    {modalData.content}
                </ModalDialog>

                <div className={styles.buttonRow}>
                    <Button className="btn-primary" onClickAsync={() => this.setState({committing: true})}
                            label="Commit" disabled={this.state.committing}/>
                    <Button className="btn-primary" onClickAsync={::this.remotePull} label="Pull from remote"/>
                    <Button className="btn-primary" onClickAsync={::this.remotePush} label="Push to remote"/>
                </div>

                <div className="form-group">
                    <label htmlFor="remoteUrl">Remote:</label>
                    <div className="row">
                        <div className="input-group col-12 col-sm-6">
                            <input type="text" value={this.state.remoteUrl} id="remoteUrl"
                                   className="form-control" aria-describedby='remote_help'
                                   onChange={evt => this.setState({remoteUrl: evt.target.value})}
                            />
                            <div className="input-group-append">
                                <Button label={t('Save')} className="btn-secondary" onClickAsync={::this.saveRemote}/>
                            </div>
                        </div>
                    </div>
                </div>

                <Table withHeader ref={node => this.logTable = node} data={this.state.data} columns={columns}
                       order={[[2, 'desc']]}/>

                <div className={styles.buttonRow}>
                    <Button className="btn-primary" onClickAsync={::this.fetch} label="Load commits"/>
                </div>
            </Panel>
        );
    }
}
