function evaluate(condition, sigSetId) {
    if (condition === 'true') return true;
    if (condition === 'false') return false;
    return condition;
}

module.exports.evaluate = evaluate;
