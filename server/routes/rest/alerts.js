'use strict';

const passport = require('../../lib/passport');
const alerts = require('../../models/alerts');
const router = require('../../lib/router-async').create();
const { castToInteger } = require('../../lib/helpers');

router.getAsync('/alerts/:alertId', passport.loggedIn, async (req, res) => {
    const alert = await alerts.getById(req.context, castToInteger(req.params.alertId));
    alert.hash = alerts.hash(alert);
    return res.json(alert);
});

router.postAsync('/alerts', passport.loggedIn, passport.csrfProtection, async (req, res) => {
    return res.json(await alerts.create(req.context, req.body));
});

router.putAsync('/alerts/:alertId', passport.loggedIn, passport.csrfProtection, async (req, res) => {
    const alert = req.body;
    alert.id = castToInteger(req.params.alertId);

    await alerts.updateWithConsistencyCheck(req.context, alert);
    return res.json();
});

router.deleteAsync('/alerts/:alertId', passport.loggedIn, passport.csrfProtection, async (req, res) => {
    await alerts.remove(req.context, castToInteger(req.params.alertId));
    return res.json();
});

router.postAsync('/alerts-table', passport.loggedIn, async (req, res) => {
    return res.json(await alerts.listDTAjax(req.context, req.body));
});

module.exports = router;
