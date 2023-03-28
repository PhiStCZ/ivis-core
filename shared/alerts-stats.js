'use strict';

/**
 * Safely returns specified element from the signal set.
 * @param {Object[]} array - Array of records of a signal set.
 * @param {string} key - Cid of a signal in the signal set.
 * @param {number} distance - Distance in the past. If the array is not long enough, the last element is used.
 * @returns {*} The specified element from the signals set.
 */
function past(array, key, distance){
    if (distance >= array.length) distance = array.length - 1;
    return array[distance][key];
}

/**
 * Calculates average of a numeric signal. Uses at most the number of latest records specified in length.
 * @param {Object[]} array - Array of records of a signal set.
 * @param {string} key - Cid of a numeric signal in the signal set.
 * @param {number} length - Maximum number of latest records to use for the calculation.
 * @returns {number} The calculated average.
 */
function avg(array, key, length){
    if (length > array.length) length = array.length;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < length; i++) {
        if (array[i][key] !== null) {
            if (typeof array[i][key] !== 'number') throw new Error('Signal in avg function is not numerical!');
            sum += array[i][key];
            count++;
        }
    }
    return sum / count;
}

/**
 * Calculates variance of a numeric signal. Uses at most the number of latest records specified in length.
 * @param {Object[]} array - Array of records of a signal set.
 * @param {string} key - Cid of a numeric signal in the signal set.
 * @param {number} length - Maximum number of latest records to use for the calculation.
 * @returns {number} The calculated variance.
 */
function vari(array, key, length){
    if (length > array.length) length = array.length;
    let aver;
    try {
        aver = avg(array, key, length);
    }
    catch (error) {
        if (error.message === 'Signal in avg function is not numerical!') throw new Error('Signal in vari function is not numerical!');
        else throw error;
    }
    let sum = 0;
    let count = 0;
    for (let i = 0; i < length; i++) {
        if (array[i][key] !== null) {
            if (typeof array[i][key] !== 'number') throw new Error('Signal in vari function is not numerical!');
            sum += Math.pow(array[i][key] - aver, 2);
            count++;
        }
    }
    return sum / count;
}

/**
 * Returns the minimum of the signal. Uses at most the number of latest records specified in length.
 * @param {Object[]} array - Array of records of a signal set.
 * @param {string} key - Cid of a signal in the signal set.
 * @param {number} length - Maximum number of latest records to use for the search.
 * @returns {*} The found minimum.
 */
function min(array, key, length){
    if (length > array.length) length = array.length;
    let min = null;
    for (let i = 0; i < length; i++) if (array[i][key] !== null && (min === null || array[i][key] < min)) min = array[i][key];
    return min;
}

/**
 * Returns the maximum of the signal. Uses at most the number of latest records specified in length.
 * @param {Object[]} array - Array of records of a signal set.
 * @param {string} key - Cid of a signal in the signal set.
 * @param {number} length - Maximum number of latest records to use for the search.
 * @returns {*} The found maximum.
 */
function max(array, key, length){
    if (length > array.length) length = array.length;
    let max = null;
    for (let i = 0; i < length; i++) if (array[i][key] !== null && (max === null || array[i][key] > max)) max = array[i][key];
    return max;
}

/**
 * Calculates the quantile of the signal and returns the element of the signal that is nearest to the quantile. Uses at most the number of latest records specified in length.
 * @param {Object[]} array - Array of records of a signal set.
 * @param {string} key - Cid of a signal in the signal set.
 * @param {number} length - Maximum number of latest records to use for the calculation.
 * @param {number} q - 0 <= q <= 1, the quantile
 * @returns {*} The element of the signal that is nearest to the quantile.
 */
function qnt(array, key, length, q){
    if (length > array.length) length = array.length;
    let values = [];
    for (let i = 0; i < length; i++) if (array[i][key] !== null) values.push(array[i][key]);
    let numeric = false;
    for (let i = 0; i < values.length; i++) if (typeof values[i] === 'number') numeric = true;
    if (numeric) values.sort((a, b) => a - b);
    else values.sort();
    const index = Math.ceil(values.length * q) - 1;
    return values[index < 0 ? 0 : index];
}

module.exports = {
    past,
    avg,
    vari,
    min,
    max,
    qnt
};
