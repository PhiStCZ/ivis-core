'use strict';

const config = require('../../lib/config');
const knex = require('../../lib/knex');
const es = require('../../lib/elasticsearch');
const log = require('../../lib/log');
const {RunStatus, JobMsgType} = require('../../../shared/jobs');
const {SignalSetType} = require('../../../shared/signal-sets');
const {SignalSource} = require('../../../shared/signals');
const {getSignalEntitySpec, allowedKeysCreate: allowedSignalKeysCreate} = require('../../lib/signal-helpers')
const {getSignalSetEntitySpec, allowedKeysCreate: allowedSignalSetKeysCreate} = require('../../lib/signal-set-helpers')
const {getIndexName} = require('../../lib/indexers/elasticsearch-common');
const {filterObject} = require('../../lib/helpers');
const {getAdminContext} = require('../../lib/context-helpers');
const createSigSet = require('../../models/signal-sets').createTx;
const createSignal = require('../../models/signals').createTx;

const {getSuccessEventType, getOutputEventType, EventTypes} = require('../../lib/task-events');

const {TYPE_JOBS, INDEX_JOBS, STATE_FIELD} = require('../../lib/task-handler').esConstants
const LOG_ID = 'Task-handler';

function parseRequest(req) {
    return JSON.parse(req);
}


/**
 * Process request for signal set and signals creation
 * Signals are specified in sigSet.signals
 * Uses same data format as web creation
 * @param jobId
 * @param signalSets
 * @param signalsSpec
 * @returns {Promise<IndexInfo>} Created indices and mapping
 */
async function processCreateRequest(jobId, signalSets, signalsSpec) {
    const esInfo = {};


    try {
        await knex.transaction(async (tx) => {
            if (signalSets) {

                if (!Array.isArray(signalSets)) {
                    signalSets = [signalSets];
                }

                for (let signalSet of signalSets) {
                    esInfo[signalSet.cid] = await createSignalSetWithSignals(tx, signalSet);
                }
            }

            if (signalsSpec) {
                for (let [sigSetCid, signals] of Object.entries(signalsSpec)) {
                    const sigSet = await tx('signal_sets').where('cid', sigSetCid).first();
                    if (!sigSet) {
                        throw new Error(`Signal set with cid ${sigSetCid} not found`);
                    }

                    esInfo[sigSetCid] = esInfo[sigSetCid] || {};
                    esInfo[sigSetCid]['index'] = getIndexName(sigSet);
                    esInfo[sigSetCid]['signals'] = {};
                    const createdSignals = {};

                    if (!Array.isArray(signals)) {
                        signals = [signals];
                    }

                    for (let signal of signals) {
                        createdSignals[signal.cid] = await createComputedSignal(tx, sigSet.id, signal);
                    }

                    esInfo[sigSetCid]['signals'] = createdSignals;
                }
            }
        });
    } catch (error) {
        log.warn(LOG_ID, error);
        esInfo.error = error.message;
    }

    return esInfo;


    async function createSignalSetWithSignals(tx, signalSet) {
        let signals = signalSet.signals;
        const filteredSignalSet = filterObject(signalSet, allowedSignalSetKeysCreate);

        filteredSignalSet.type = SignalSetType.COMPUTED;

        filteredSignalSet.id = await createSigSet(tx, getAdminContext(), filteredSignalSet);
        const ceatedSignalSet = await tx('signal_sets').where('id', filteredSignalSet.id).first();
        const signalSetSpec = getSignalSetEntitySpec(ceatedSignalSet);

        const createdSignalsSpecs = {};
        if (signals) {
            if (!Array.isArray(signals)) {
                signals = [signals];
            }

            for (const signal of signals) {
                createdSignalsSpecs[signal.cid] = await createComputedSignal(tx, filteredSignalSet.id, signal);
            }
        }
        await tx('signal_sets_owners').insert({job: jobId, set: filteredSignalSet.id});

        signalSetSpec['signals'] = createdSignalsSpecs;
        return signalSetSpec;
    }

    async function createComputedSignal(tx, signalSetId, signal) {
        const filteredSignal = filterObject(signal, allowedSignalKeysCreate);
        // Here are possible overwrites of input from job
        filteredSignal.source = SignalSource.JOB;
        const sigId = await createSignal(tx, getAdminContext(), signalSetId, filteredSignal);
        const createdSignal = await tx('signals').where('id', sigId).first();

        // TODO should add something like signal_sets_owners for signals probably
        return getSignalEntitySpec(createdSignal);
    }
}

async function handleRequest(jobId, requestStr) {
    let response = {};

    if (!requestStr) {
        response.error = "Request not specified";
        return response;
    }

    let request = {};
    try {
        request = parseRequest(requestStr);

        if (request.id) {
            response.id = request.id;
        }

    } catch (err) {
        response.error = `Request parsing failed: ${err.message}`;
        return response;
    }

    if (!request.type) {
        response.error = "Type not specified";
        return response;
    }

    try {
        switch (request.type) {
            case JobMsgType.CREATE_SIGNALS:
                if (request.signalSets || request.signals) {
                    const reqResult = await processCreateRequest(jobId, request.signalSets, request.signals);
                    response = {
                        ...response,
                        ...reqResult
                    };
                } else {
                    response.error = `Either signalSets or signals have to be specified`;
                }
                break;
            case  JobMsgType.STORE_STATE:
                if (request[STATE_FIELD]) {
                    const reqResult = await storeRunState(jobId, request[STATE_FIELD]);
                    response = {
                        ...response,
                        ...reqResult
                    };
                } else {
                    response.error(`${STATE_FIELD} not specified`)
                }
                break;
            default:
                response.error = `Type ${request.type} not recognized`;
                break;
        }
    } catch (error) {
        log.warn(LOG_ID, error);
        response.error = error.message;
    }
    return response;
}

function createRunManager(jobId, runId, runOptions) {
    const runData = {};
    runData.started_at = new Date();

    const maxOutput = config.tasks.maxRunOutputBytes || 1000000;
    let outputBytes = 0;
    let limitReached = false;
    let outputBuffer = [];
    let timer;
    let accessTokenRefreshTimer;
    let accessToken = runOptions.config.inputData.accessToken;

    if (accessToken) {
        refreshAccessToken().catch(
            e => log.error(e)
        );
    }

    return {
        onRunEvent,
        onRunSuccess,
        onRunFail: onRunFailFromRunningStatus
    }

    async function refreshAccessToken() {
        runOptions.emit(EventTypes.ACCESS_TOKEN_REFRESH, {
            runId,
            jobId,
            accessToken
        });
        accessTokenRefreshTimer = setTimeout(refreshAccessToken, 30 * 1000);
    }

    async function onRunFailFromRunningStatus(errMsg) {
        await cleanBuffer();
        clearTimeout(accessTokenRefreshTimer);
        await runOptions.onRunFail(jobId, runId, runData, errMsg);
    }

    /**
     * Callback for successful run.
     * @param config
     * @returns {Promise<void>}
     */
    async function onRunSuccess(config) {
        await cleanBuffer();
        clearTimeout(accessTokenRefreshTimer);

        runOptions.onRunSuccess();
        runData.finished_at = new Date();
        runData.status = RunStatus.SUCCESS;
        try {
            await knex('job_runs').where('id', runId).update(runData);
            if (config) {
                await storeRunState(config);
            }
        } catch (err) {
            log.error(LOG_ID, err);
        }
        runOptions.emit(getSuccessEventType(runId));
    }

    async function cleanBuffer() {
        try {
            if (outputBuffer.length > 0) {
                let output = [...outputBuffer];
                outputBuffer = [];
                runOptions.emit(getOutputEventType(runId), output);
                await knex('job_runs').update({output: knex.raw('CONCAT(COALESCE(`output`,\'\'), ?)', output.join(''))}).where('id', runId);
            }
            timer = null;
        } catch (e) {
            log.error(LOG_ID, `Output handling for the run ${runId} failed`, e);
            outputBuffer = [];
            timer = null;
        }
    }

    async function onRunEvent(type, data) {
        switch (type) {
            case 'output':
                try {
                    if (!limitReached) {
                        let byteLength = Buffer.byteLength(data, 'utf8');
                        outputBytes += byteLength
                        if (outputBytes >= maxOutput) {
                            limitReached = true;
                            if (config.tasks.printLimitReachedMessage === true) {
                                try {
                                    await knex('job_runs').update({output: knex.raw('CONCAT(`output`, \'INFO: max output storage capacity reached\')')}).where('id', runId);

                                    const maxMsg = 'INFO: max output capacity reached'
                                    if (!timer) {
                                        runOptions.emit(getOutputEventType(runId), maxMsg);
                                    } else {
                                        outputBuffer.push(maxMsg);
                                    }
                                } catch (e) {
                                    log.error(LOG_ID, `Output handling for the run ${runId} failed`, e);
                                }
                            }
                        } else {
                            outputBuffer.push(data);
                            // TODO Don't know how well this will scale
                            // --   it might be better to append to a file, but this will require further syncing
                            // --   as we need full output for task development in the UI, not only output after the register of listener
                            // --   therefore keeping it this way for now
                            if (!timer) {
                                timer = setTimeout(cleanBuffer, 1000);
                            }
                        }
                    }

                } catch (e) {
                    log.error(LOG_ID, `Output handling for the run ${runId} failed`, e);
                }
                break;
            case 'request':
                return await handleRequest(jobId, data);
            default:
                log.info(LOG_ID, `Job ${jobId} run ${runId}: unknown event ${type} `);
                break;
        }
    }
}


/**
 * Store config from job, overwrites old config
 * @param id ID of the job config belongs to
 * @param state Config to store, JSON format
 * @returns {Promise<void>}
 */
async function storeRunState(id, state) {
    const jobBody = {};
    jobBody[STATE_FIELD] = state;
    try {
        await es.index({index: INDEX_JOBS, type: TYPE_JOBS, id: id, body: jobBody});
    } catch (err) {
        log.error(LOG_ID, err);
        return {error: err.message};
    }
}

module.exports = {
    createRunManager
}