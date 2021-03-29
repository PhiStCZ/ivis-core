'use strict';

const passport = require('../../lib/passport');
const alertsLog = require('../../models/alerts-log');
const router = require('../../lib/router-async').create();
const { castToInteger } = require('../../lib/helpers');

router.postAsync('/alerts-log', passport.loggedIn, passport.csrfProtection, async (req, res) => {
    if (req.body.type !== 'test') return; //just for security
    return res.json(await alertsLog.addEntry(req.context, req.body));
});

router.postAsync('/alerts-log-table/:alertId', passport.loggedIn, async (req, res) => {
    return res.json(await alertsLog.listLogForAlert(req.context, req.body, castToInteger(req.params.alertId)));
});

module.exports = router;
