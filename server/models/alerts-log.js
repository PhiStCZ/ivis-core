'use strict';

const knex = require('../lib/knex');
const { filterObject } = require('../lib/helpers');
const dtHelpers = require('../lib/dt-helpers');
const shares = require('./shares');
const { sendEmail } = require('../lib/mailer');
const { sendSMS } = require('../lib/SMS-sender');
const moment = require('moment');
const config = require('../lib/config');

const allowedKeys = new Set(['alert', 'type']);

async function listLogForAlert(context, params, alertId) {
    return await knex.transaction(async tx => {

        await shares.enforceEntityPermissionTx(tx, context, 'alert', alertId, 'view');

        return await dtHelpers.ajaxListTx(tx, params, builder => builder.from('alerts_log').where('alert', alertId), [ 'type', 'time' ]);
    });
}

async function listLogForAlertSimple(context, alertId) {
    return await knex.transaction(async tx => {

        await shares.enforceEntityPermissionTx(tx, context, 'alert', alertId, 'view');

        return await tx('alerts_log').where('alert', alertId).select('time', 'type');
    });
}

async function addEntry(context, entity) {
    return await knex.transaction(async tx => {

        await shares.enforceEntityPermissionTx(tx, context, 'alert', entity.alert, 'trigger');

        const filteredEntity = filterObject(entity, allowedKeys);

        const ids = await tx('alerts_log').insert(filteredEntity);
        const id = ids[0];

        if (entity.type === 'test') {
            const alert = await tx('alerts').where('id', entity.alert).first();
            if (alert) {
                const senderName = 'IVIS Alert Test';
                const addresses = alert.emails.split(/\r?\n/).slice(0, config.alerts.maxEmailRecipients);
                const subject = `Alert ${alert.name} was manually tested`;
                const text = `Alert ${alert.name} was manually tested.\nTime: ${moment().format('YYYY-MM-DD HH:mm:ss')}\nDescription:\n${alert.description}\nCondition:\n${alert.condition}`;
                try { await sendEmail(senderName, addresses, subject, text); } catch {}

                const phones = alert.phones.split(/\r?\n/).slice(0, config.alerts.maxSMSRecipients);
                for (let i = 0; i < phones.length; i++) try { await sendSMS(phones[i], senderName + '\n' + subject + '.'); } catch {}
            }
        }

        return id;
    });
}

module.exports.listLogForAlert = listLogForAlert;
module.exports.listLogForAlertSimple = listLogForAlertSimple;
module.exports.addEntry = addEntry;
