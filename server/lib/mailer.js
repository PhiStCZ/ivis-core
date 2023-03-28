'use strict';

const nodemailer = require('nodemailer');
const config = require('./config');

/**
 * Sends email using Nodemailer.
 * @param {string} senderName - The name of the sender. (e.g. IVIS Alerts)
 * @param {string[]} receiverAddress - Array of email addresses.
 * @param {string} subject - The subject of the email.
 * @param {string} text - The body of the email.
 * @returns {Promise<*>} Status of the operation.
 */
async function sendEmail(senderName, receiverAddress, subject, text) {
    if (!config.email.host) return;
    let transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.port === 465,
        auth: {
            user: config.email.account,
            pass: config.email.password
        }
    });
    return await transporter.sendMail({
        from: `"${senderName}" <${config.email.account}>`,
        to: receiverAddress,
        subject: subject,
        text: text
    });
}

module.exports.sendEmail = sendEmail;
