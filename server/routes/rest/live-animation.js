'use strict';

const router = require('../../lib/router-async').create();
const log = require('../../lib/log');
const em = require('../../lib/extension-manager');
const passport = require('../../lib/passport');

router.use('/animation/:animationId', passport.loggedIn, (req, res, next) => {
    const service = em.get('animation.' + req.params.animationId, null);
    if (!service) {
        res.status(404).send(`Animation with the id of: '${req.params.animationId}' was not found.`);
    } else {
        req.animationInstance = service;
        next();
    }
});

router.get('/animation/:animationId/status', passport.loggedIn, (req, res) => {
    try {
        const currentStatus = req.animationInstance.getStatus();
        res.status(200).json(currentStatus);
    } catch (error) {
        log.error(`Animation '${req.params.animationId}'`, error);
        res.sendStatus(500);
    }
});

router.post('/animation/:animationId/:control(play|pause)', passport.loggedIn, (req, res) => {
    try {
        req.animationInstance[req.params.control]();
    } catch (error) {
        log.error(`Animation '${req.params.animationId}'`, error);
        res.sendStatus(500);
        return;
    }

    res.sendStatus(200);
});

module.exports = router;
