'use strict';

const knex = require('./knex');
const {evaluate} = require('./alerts-condition-parser');
const moment = require('moment');
const {sendEmail} = require('./mailer');
const {sendSMS} = require('./SMS-sender');
const config = require('./config');
const log = require("../lib/log");

const LOG_ID = 'alerts-class'

const States = Object.freeze({
    GOOD: 'good',
    WORSE: 'worse',
    BAD: 'bad',
    BETTER: 'better'
});

/**
 * Instances of this class represent the alerts in the memory.
 */
class Alert {
    /**
     * Async method init should be usually called immediately after this constructor.
     * @constructor
     * @param {RowDataPacket} fields - Object of attributes from the database.
     */
    constructor(fields) {
        this.fields = fields;
    }

    /**
     * Initializes new alert or restores old alerts after restart of IVIS according to the attributes and elapsed time.
     */
    async init() {
        await this.addLogEntry('init');
        if (!this.fields.enabled) return;
        if (this.fields.repeat !== 0 && (this.fields.state === States.BAD || this.fields.state === States.BETTER)) await this.repeatNotification();
        const elapsed = moment().diff(this.fields.state_changed);
        if (this.fields.state === States.WORSE) {
            if (elapsed >= this.fields.duration * 60 * 1000) await this.trigger();
            else this.conditionClock = setTimeout(this.conditionClockHandler.bind(this), (this.fields.duration * 60 * 1000) - elapsed);
        } else if (this.fields.state === States.BETTER) {
            if (elapsed >= this.fields.delay * 60 * 1000) await this.revoke();
            else this.conditionClock = setTimeout(this.conditionClockHandler.bind(this), (this.fields.delay * 60 * 1000) - elapsed);
        }

        if (this.fields.interval !== 0) {
            const elapsedInterval = moment().diff(this.fields.interval_time);
            if (elapsedInterval >= this.fields.interval * 60 * 1000) await this.intervalNotification();
            else this.intervalClock = setTimeout(this.intervalNotification.bind(this), (this.fields.interval * 60 * 1000) - elapsedInterval);
        }
    }

    /**
     * Updates the alert and changes the internal state according to the new values.
     * @param {RowDataPacket} newFields - Object of attributes from the database. Contains updated values as well as unchanged values.
     */
    async update(newFields) {
        await this.addLogEntry('update');
        let ns = '';
        if (!newFields.enabled) {
            this.terminate();
            ns = States.GOOD;
        } else if (this.fields.sigset !== newFields.sigset || this.fields.duration !== newFields.duration || this.fields.instant_revoke !== newFields.instant_revoke ||
            this.fields.delay !== newFields.delay || this.fields.condition !== newFields.condition) {
            clearTimeout(this.conditionClock);
            clearTimeout(this.repeatClock);
            ns = States.GOOD;
        } else if (this.fields.repeat !== newFields.repeat) {
            clearTimeout(this.repeatClock);
            if (newFields.repeat !== 0 && (this.fields.state === States.BAD || this.fields.state === States.BETTER)) this.repeatClock = setTimeout(this.repeatNotification.bind(this), newFields.repeat * 60 * 1000);
        }

        let sit = false;
        if ((!this.fields.enabled && newFields.enabled) || (newFields.enabled && this.fields.interval !== newFields.interval)) {
            sit = true;
            clearTimeout(this.intervalClock);
            if (newFields.interval !== 0) this.intervalClock = setTimeout(this.intervalNotification.bind(this), newFields.interval * 60 * 1000);
        }

        this.fields = newFields;
        if (ns !== '') await this.writeState(ns);
        if (sit) await this.setIntervalTime();
    }

    /**
     * Clears all timers. Should be called when the alert is deleted.
     */
    terminate() {
        clearTimeout(this.conditionClock);
        clearTimeout(this.repeatClock);
        clearTimeout(this.intervalClock);
    }

    /**
     * Executes the check of the related signal set. Should be called when a new record is added to the related signal set.
     */
    async execute() {
        if (!this.fields.enabled) return;

        clearTimeout(this.intervalClock);
        await this.setIntervalTime();
        if (this.fields.interval !== 0) this.intervalClock = setTimeout(this.intervalNotification.bind(this), this.fields.interval * 60 * 1000);

        const result = await evaluate(this.fields.condition, this.fields.sigset);
        if (typeof result === 'boolean') await this.changeState(result);
        else await this.addLogEntry(result);
    }

    /**
     * Changes the internal state of the alert according to the current state and the parameter result.
     * Possible states are: good, worse, bad, better.
     * @param {boolean} result - The result of the executed check of the signal set. true means bad data and false means good data.
     */
    async changeState(result) {
        if (result) {
            if (this.fields.state === States.GOOD) {
                if (this.fields.duration === 0) {
                    await this.trigger();
                } else {
                    await this.writeState(States.WORSE);
                    this.conditionClock = setTimeout(this.conditionClockHandler.bind(this), this.fields.duration * 60 * 1000);
                }
            } else if (this.fields.state === States.BETTER) {
                clearTimeout(this.conditionClock);
                await this.writeState(States.BAD);
            }
        } else {
            if (this.fields.state === States.BAD) {
                if (this.fields.delay === 0) {
                    await this.revoke();
                } else {
                    await this.writeState(States.BETTER);
                    this.conditionClock = setTimeout(this.conditionClockHandler.bind(this), this.fields.delay * 60 * 1000);
                }
            } else if (this.fields.state === States.WORSE) {
                clearTimeout(this.conditionClock);
                await this.writeState(States.GOOD);
            }
        }
    }

    async conditionClockHandler() {
        if (this.fields.state === States.WORSE) {
            await this.trigger();
        } else if (this.fields.state === States.BETTER) {
            await this.revoke();
        }
    }

    async trigger() {
        if (this.fields.instant_revoke) {
            await this.writeState(States.GOOD);
            await this.addLogEntry('triggerAndRevoke');
            const subject = `Alert ${this.fields.name} was triggered and revoked!`;
            const text = `Alert ${this.fields.name} was triggered and revoked!\nTime: ${moment().format('YYYY-MM-DD HH:mm:ss')}\nDescription:\n${this.fields.description}\nCondition:\n${this.fields.condition}`;
            await this.sendNotification(subject, text, subject);
        } else {
            await this.writeState(States.BAD);
            await this.addLogEntry('trigger');
            if (this.fields.repeat !== 0) this.repeatClock = setTimeout(this.repeatNotification.bind(this), this.fields.repeat * 60 * 1000);
            const subject = `Alert ${this.fields.name} was triggered!`;
            const text = `Alert ${this.fields.name} was triggered!\nTime: ${moment().format('YYYY-MM-DD HH:mm:ss')}\nDescription:\n${this.fields.description}\nCondition:\n${this.fields.condition}`;
            await this.sendNotification(subject, text, subject);
        }
    }

    async revoke() {
        clearTimeout(this.repeatClock);
        await this.writeState(States.GOOD);
        await this.addLogEntry('revoke');
        if (this.fields.finalnotification) {
            const subject = `Alert ${this.fields.name} was revoked`;
            const text = `Alert ${this.fields.name} was revoked.\nTime: ${moment().format('YYYY-MM-DD HH:mm:ss')}\nDescription:\n${this.fields.description}\nCondition:\n${this.fields.condition}`;
            await this.sendNotification(subject, text);
        }
    }

    async repeatNotification() {
        this.repeatClock = setTimeout(this.repeatNotification.bind(this), this.fields.repeat * 60 * 1000);
        const subject = `Alert ${this.fields.name} is still triggered!`;
        const text = `Alert ${this.fields.name} has been triggered!\nTime: ${moment().format('YYYY-MM-DD HH:mm:ss')}\nDescription:\n${this.fields.description}\nCondition:\n${this.fields.condition}`;
        await this.sendNotification(subject, text);
    }

    async writeState(newState) {
        const time = moment().format('YYYY-MM-DD HH:mm:ss');
        await knex.transaction(async tx => {
            await tx('alerts').where('id', this.fields.id).update({state: newState, state_changed: time});
            this.fields.state_changed = (await tx('alerts').where('id', this.fields.id).first('state_changed')).state_changed;
            this.fields.state = newState;
        });
    }

    async addLogEntry(value) {
        try {
            await knex('alerts_log').insert({alert: this.fields.id, type: value});
        } catch (e) {
            log.error(LOG_ID, e);
        }
    }

    async intervalNotification() {
        await this.setIntervalTime();
        this.intervalClock = setTimeout(this.intervalNotification.bind(this), this.fields.interval * 60 * 1000);
        await this.addLogEntry('interval');
        const subject = `Alert ${this.fields.name}: Signal record did not arrive in time!`;
        const text = `Alert ${this.fields.name}: Signal record did not arrive in time!\nTime: ${moment().format('YYYY-MM-DD HH:mm:ss')}\nDescription:\n${this.fields.description}\nInterval: ${this.fields.interval}`;
        await this.sendNotification(subject, text);
    }

    async setIntervalTime() {
        const time = moment().format('YYYY-MM-DD HH:mm:ss');
        await knex.transaction(async tx => {
            await tx('alerts').where('id', this.fields.id).update({interval_time: time});
            this.fields.interval_time = (await tx('alerts').where('id', this.fields.id).first('interval_time')).interval_time;
        });
    }

    async sendNotification(emailSubject, emailText, SMSText) {
        const senderName = 'IVIS Alert';
        const addresses = this.fields.emails.split(/\r?\n/).slice(0, config.alerts.maxEmailRecipients);

        try {
            await sendEmail(senderName, addresses, emailSubject, emailText);
        } catch (e) {
            log.error(LOG_ID, e);
        }
        if (SMSText) {
            const phones = this.fields.phones.split(/\r?\n/).slice(0, config.alerts.maxSMSRecipients);
            for (let i = 0; i < phones.length; i++) {
                try {
                    await sendSMS(phones[i], senderName + '\n' + SMSText);
                } catch (e) {
                    log.error(LOG_ID, e);
                }
            }
        }
    }
}

module.exports.Alert = Alert;
