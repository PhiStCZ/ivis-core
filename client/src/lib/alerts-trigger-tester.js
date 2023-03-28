'use strict';

import axios, {HTTPMethod} from "./axios";
import {getUrl} from "./urls";

const addUrl = 'rest/alerts-log';

let testReady = true;

/**
 * Sends a request to test the notifications of the alert with fake trigger. Works only once per minute.
 * @param {number} alertId - The id of the alert to test.
 * @returns {Promise<boolean>} True if and only if the request was actually made.
 */
async function testTrigger (alertId){
    if (!testReady) return false;
    testReady = false;
    axios.method(HTTPMethod.POST, getUrl(addUrl), {alert: alertId, type: 'test'});
    setTimeout(() => testReady = true, 60 * 1000);
    return true;
}

export default testTrigger;
