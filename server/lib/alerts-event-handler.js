'use strict';

const esEmitter = require('./indexers/elasticsearch').emitter;
const knex = require('./knex');
const { Alert } = require('./alerts-class');
const log = require('./log');

/**
 * Contains pairs of alert id and instance of Alert for every alert.
 * @type {Map<number, Alert>}
 */
const alerts = new Map();

/**
 * Initializes the part of the framework responsible for alerts when the framework is started.
 */
async function init(){
    log.info('Alerts', 'Initializing...');
    const tmp = await knex('alerts').select();
    for (let i = 0; i < tmp.length; i++) {
        const aux = new Alert(tmp[i]);
        await aux.init();
        alerts.set(tmp[i].id, aux);
    }

    esEmitter.on('insert', cid => {setTimeout(() => handleRecordInsert(cid), 3000)}); //time delay to compensate for slow ElasticSearch
    log.info('Alerts', 'Initialized');
}

/**
 * Executes the alerts related to the signal set.
 * Called as an event handler when a new record is added to the signal set.
 * @param {string} cid - Cid of the signal set.
 */
async function handleRecordInsert(cid){
    const alertIds = await knex('alerts').innerJoin('signal_sets', 'alerts.sigset', 'signal_sets.id').where('signal_sets.cid', cid).select('alerts.id');
    for (let i = 0; i < alertIds.length; i++) await alerts.get(alertIds[i].id).execute();
}

/**
 * Called when a new alert is created in the database by a user.
 * @param {transaction} tx - Knex database transaction.
 * @param {number} id - The id of the created alert.
 */
async function handleCreateTx(tx, id){
    const newAlert = await tx('alerts').where('id', id).first();
    const aux = new Alert(newAlert);
    aux.init();
    alerts.set(newAlert.id, aux);
}

/**
 * Called when an alert is updated in the database by a user.
 * @param {transaction} tx - Knex database transaction.
 * @param {number} id - The id of the updated alert.
 */
async function handleUpdateTx(tx, id){
    const updatedAlert = await tx('alerts').where('id', id).first();
    alerts.get(updatedAlert.id).update(updatedAlert);
}

/**
 * Called when an alert is deleted in the database by a user.
 * @param {number} id - The id of the deleted alert.
 */
async function handleDelete(id){
    alerts.get(id).terminate();
    alerts.delete(id);
}

module.exports.init = init;
module.exports.handleCreateTx = handleCreateTx;
module.exports.handleUpdateTx = handleUpdateTx;
module.exports.handleDelete = handleDelete;
