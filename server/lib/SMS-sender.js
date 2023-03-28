'use strict';

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const config = require('./config');

/**
 * This is configured SNSClient that is used with AWS-SNS API.
 * Contains an error if something went wrong during initialization.
 * This constant is automatically initialized.
 * @type {SNSClient}
 */
const client = function() {
    if (!config.SMS.keyID) return;
    process.env.AWS_ACCESS_KEY_ID = config.SMS.keyID;
    process.env.AWS_SECRET_ACCESS_KEY = config.SMS.secretKey;
    return new SNSClient({region: config.SMS.region});
}();

/**
 * Sends SMS message via AWS-Simple Notification Service.
 * @param {string} phoneNumber - The phone number of the recipient in E.164 format.
 * @param {string} text - The text of the SMS, it is better to keep it short.
 * @returns {Promise<*>} Status of the operation.
 */
async function sendSMS(phoneNumber, text) {
    if (!client) return;
    const params = {PhoneNumber: phoneNumber, Message: text};
    return await client.send(new PublishCommand(params));
}

module.exports.sendSMS = sendSMS;
