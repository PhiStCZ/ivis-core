'use strict';

const math = require('mathjs');
const knex = require('./knex');
const dataModel = require('../models/signal-sets');
const adminContext = require('./context-helpers').getAdminContext();
const config = require('./config');
const stats = require('../../shared/alerts-stats');

/**
 * Evaluates the condition with the signal set.
 * @param {string} condition - The condition to evaluate.
 * @param {number} sigSetId - The id of the signal set related to the condition.
 * @returns {Promise<string|boolean>} The boolean result of the evaluation or a string with an error message.
 */
async function evaluate(condition, sigSetId){
    let result;
    try {
        const scope = await setupScope(sigSetId);
        result = math.evaluate(condition, scope);
    }
    catch(error){
        return error.message;
    }
    if (typeof result === 'boolean') return result;
    else if (result && result.entries && result.entries.length !== 0 && typeof result.entries[result.entries.length - 1] === 'boolean') return result.entries[result.entries.length - 1];
    else return 'NotBoolError';
}

/**
 * Creates scope of functions and data from signal set for the evaluator.
 * @param {number} sigSetId - The id of the signal set.
 * @returns {Promise<Object>} The scope for the evaluator.
 */
async function setupScope(sigSetId){
    const sigSetCid = (await knex('signal_sets').where('id', sigSetId).first('cid')).cid;
    const signals = [];
    (await knex('signals').where('set', sigSetId).select('cid')).forEach(item => signals.push(item.cid));

    const query = [
        {
            params: { withId: true },
            sigSetCid: sigSetCid,
            docs:{
                signals: signals,
                limit: config.alerts.maxResultsWindow,
                sort: [
                    {
                        field: 'id',
                        order: 'desc'
                    }
                ]
            }
        }
    ];

    const results = await dataModel.query(adminContext, query);
    const latest = results[0].docs[0];
    const scope = {};
    Object.keys(latest).forEach(key => scope['$' + key] = latest[key])

    const records = results[0].docs;
    scope.past = (cid, distance) => stats.past(records, cid, distance);
    scope.avg = (cid, length) => stats.avg(records, cid, length);
    scope.vari = (cid, length) => stats.vari(records, cid, length);
    scope.min = (cid, length) => stats.min(records, cid, length);
    scope.max = (cid, length) => stats.max(records, cid, length);
    scope.qnt = (cid, length, q) => stats.qnt(records, cid, length, q);

    return scope;
}

module.exports.evaluate = evaluate;
