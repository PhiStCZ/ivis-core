const momentOriginal = jest.requireActual('moment');

let currentTime = null;

function moment() {
    return momentOriginal(currentTime);
}

function advanceClock(seconds) {
    currentTime = momentOriginal(currentTime).add(seconds, 's').format('YYYY-MM-DD HH:mm:ss');
}

function resetTime() {
    currentTime = '2021-04-01 10:00:00';
}

module.exports = moment;
module.exports.advanceClock = advanceClock;
module.exports.resetTime = resetTime;
