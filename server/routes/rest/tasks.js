'use strict';

const passport = require('../../lib/passport');
const tasks = require('../../models/tasks');
const builtinTasks = require('../../models/builtin-tasks');
const {TaskSource} = require("../../../shared/tasks");
const {getAdminContext} = require("../../lib/context-helpers");

const router = require('../../lib/router-async').create();
const {castToInteger} = require('../../lib/helpers');

router.getAsync('/tasks/:taskId', passport.loggedIn, async (req, res) => {
    const task = await tasks.getById(req.context, castToInteger(req.params.taskId));
    task.hash = tasks.hash(task);
    return res.json(task);
});

router.postAsync('/tasks', passport.loggedIn, passport.csrfProtection, async (req, res) => {
    return res.json(await tasks.create(req.context, req.body));
});

router.putAsync('/tasks/:taskId', passport.loggedIn, passport.csrfProtection, async (req, res) => {
    const task = req.body;
    task.id = castToInteger(req.params.taskId);

    await tasks.updateWithConsistencyCheck(req.context, task);
    return res.json();
});

router.deleteAsync('/tasks/:taskId', passport.loggedIn, passport.csrfProtection, async (req, res) => {
    await tasks.remove(req.context, castToInteger(req.params.taskId));
    return res.json();
});

router.postAsync('/tasks-table', passport.loggedIn, async (req, res) => {
    return res.json(await tasks.listDTAjax(req.context, req.body));
});

router.getAsync('/builtin-tasks', passport.loggedIn, async (req, res) => {
    return res.json(await builtinTasks.list());
});

// For tables
router.postAsync('/builtin-tasks', passport.loggedIn, async (req, res) => {
    return res.json(await tasks.listBuiltinDTAjaxWithoutPerms(req.body));
});

router.postAsync('/system-tasks', passport.loggedIn, async (req, res) => {
    return res.json(await tasks.listSystemDTAjaxWithoutPerms(req.context, req.body));
});

router.getAsync('/task-params/:taskId', passport.loggedIn, async (req, res) => {
    const params = await tasks.getParamsById(req.context, castToInteger(req.params.taskId));
    return res.json(params);
});

router.postAsync('/task-build/:taskId', passport.loggedIn, async (req, res) => {
    const params = await tasks.compile(req.context, castToInteger(req.params.taskId));
    return res.json(params);
});

router.postAsync('/task-reinitialize/:taskId', passport.loggedIn, async (req, res) => {
    const params = await tasks.compile(req.context, castToInteger(req.params.taskId), true);
    return res.json(params);
});


router.getAsync('/task-vcs/:taskId', passport.loggedIn, async (req, res) => {
    const logs = await tasks.getVcsLogs(req.context, castToInteger(req.params.taskId));
    return res.json(logs);
});

router.postAsync('/task-vcs/:taskId/checkout/:hash', passport.loggedIn, async (req, res) => {
    await tasks.checkout(req.context, castToInteger(req.params.taskId), req.params.hash);
    return res.json();
});

router.postAsync('/task-vcs/:taskId/commit', passport.loggedIn, async (req, res) => {
    await tasks.commit(req.context, castToInteger(req.params.taskId), req.body);
    return res.json();
});


router.getAsync('/task-vcs/:taskId/remote', passport.loggedIn, async (req, res) => {
    const remotes = await tasks.listRemotes(req.context, castToInteger(req.params.taskId), req.body);
    return res.json(remotes);
});

router.postAsync('/task-vcs/:taskId/remote', passport.loggedIn, async (req, res) => {
    await tasks.addRemote(req.context, castToInteger(req.params.taskId), req.body);
    return res.json();
});

router.postAsync('/task-vcs/:taskId/pull', passport.loggedIn, async (req, res) => {
    await tasks.remotePull(req.context, castToInteger(req.params.taskId));
    return res.json();
});

router.postAsync('/task-vcs/:taskId/push', passport.loggedIn, async (req, res) => {
    await tasks.remotePush(req.context, castToInteger(req.params.taskId));
    return res.json();
});


module.exports = router;