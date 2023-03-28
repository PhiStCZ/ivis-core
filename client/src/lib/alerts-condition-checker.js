'use strict';

import { evaluate } from "mathjs";
import axios from "./axios";
import { getUrl } from "./urls";
import { SignalType } from "../../../shared/signals";
import stats from "../../../shared/alerts-stats";

const ConditionState = Object.freeze({
    NOSIGSET: 0,
    NOTBOOL: 1,
    VALID: 2
});

let sigSet;
let scope;

/**
 * Checks the syntax of the condition with the related signal set. Used in form validation.
 * Needs to update the scope for evaluator when the signal set is changed. Call twice in this case.
 * @param {string} condition - The condition to be checked.
 * @param {number} sigSetId - The id of the signal set related to the condition.
 * @returns {string} The result of the check, "ok" if correct, an error message if wrong.
 */
function checkCondition(condition, sigSetId){
    if (!sigSetId) return ConditionState.NOSIGSET;

    if (sigSet !== sigSetId) setupFakeScope(sigSetId);
    if (!scope) return ConditionState.VALID;

    let evaluated;
    try {
        evaluated = evaluate(condition, scope);
    }
    catch(error){
        return error.message;
    }
    if (typeof evaluated === 'boolean') return ConditionState.VALID;
    else if (evaluated && evaluated.entries && evaluated.entries.length !== 0 && typeof evaluated.entries[evaluated.entries.length - 1] === 'boolean') return ConditionState.VALID;
    else return ConditionState.NOTBOOL;
}

/**
 * Fills the two variables in this file with data.
 * Parameter sigSetId is assigned to variable sigSet and generated scope is assigned to variable scope.
 * @param {number} sigSetId - The id of the signal set to work with.
 */
async function setupFakeScope(sigSetId){
    sigSet = sigSetId;
    const result = await axios.get(getUrl(`rest/signals-simple-table/${sigSetId}`));

    scope = {};
    let recordMock = {};
    result.data.forEach(item => {
        let tmp = getValueOfType(item.type);
        scope['$' + item.cid] = tmp;
        recordMock[item.cid] = tmp;
    });
    scope['$id'] = '9';
    recordMock['id'] = '9';

    let arr = [recordMock];
    scope.past = (cid, distance) => stats.past(arr, cid, distance);
    scope.avg = (cid, length) => stats.avg(arr, cid, length);
    scope.vari = (cid, length) => stats.vari(arr, cid, length);
    scope.min = (cid, length) => stats.min(arr, cid, length);
    scope.max = (cid, length) => stats.max(arr, cid, length);
    scope.qnt = (cid, length, q) => stats.qnt(arr, cid, length, q);
}

function getValueOfType(type){
    if (type === SignalType.KEYWORD || type === SignalType.TEXT) return 'text';
    if (type === SignalType.DATE_TIME) return '2021-05-06T14:28:56.000Z';
    if (type === SignalType.BOOLEAN) return true;
    return 1;
}

export { checkCondition, ConditionState };
