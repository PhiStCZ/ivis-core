'use strict';

const knex = require('../lib/knex');
const hasher = require('node-object-hash')();
const {enforce, filterObject} = require('../lib/helpers');
const dtHelpers = require('../lib/dt-helpers');
const interoperableErrors = require('../../shared/interoperable-errors');
const namespaceHelpers = require('../lib/namespace-helpers');
const shares = require('./shares');
const {
    BuildState,
    TaskSource,
    TaskType,
    subtypesByType,
    Permission,
    PYTHON_JOB_FILE_NAME
} = require('../../shared/tasks');
const {JobState} = require('../../shared/jobs');
const fs = require('fs-extra-promise');
const taskHandler = require('../lib/task-handler');
const files = require('./files');
const dependencyHelpers = require('../lib/dependency-helpers');
const {getWizard} = require("../lib/wizards");
const {isBuiltinSource} = require("../../shared/tasks");
const simpleGit = require("simple-git");
const path = require("path");

const allowedKeysCreate = new Set(['name', 'description', 'type', 'settings', 'namespace']);
const allowedKeysUpdate = new Set(['name', 'description', 'settings', 'namespace']);

const columns = ['tasks.id', 'tasks.name', 'tasks.description', 'tasks.type', 'tasks.created', 'tasks.build_state', 'tasks.source', 'namespaces.name'];

function hash(entity) {
    return hasher.hash(filterObject(entity, allowedKeysCreate));
}

function getQueryFun(source) {
    return builder => builder
        .from('tasks')
        .whereIn('tasks.source', [source])
        .innerJoin('namespaces', 'namespaces.id', 'tasks.namespace')
}

function getCodePath(taskId) {
    return path.join(taskHandler.getTaskDevelopmentDir(taskId), PYTHON_JOB_FILE_NAME);
}

async function getCodeForTask(taskId) {
    const codeFile = getCodePath(taskId);
    const hasCode = await fs.existsAsync(codeFile);
    if (hasCode) {
        return await fs.readFileAsync(codeFile, 'utf-8')
    }
    return '';
}

async function saveCodeForTask(taskId, code = '') {
    const codeFile = getCodePath(taskId);
    await fs.mkdirAsync(taskHandler.getTaskDevelopmentDir(taskId), { recursive: true });
    await fs.writeFileAsync(codeFile, code);
}

async function _insertTask(tx, task) {
    const dbTask = {
        ...task,
        settings: {...task.settings}
    };

    const code = dbTask.settings.code;
    delete dbTask.settings.code;
    dbTask.settings = JSON.stringify(dbTask.settings);
    const [id] = await tx('tasks').insert(dbTask);
    await saveCodeForTask(id, code);

    return id;
}

async function _updateTask(tx, taskId, task) {
    const dbTask = {
        ...task,
        settings: {...task.settings}
    };

    const code = dbTask.settings.code;
    delete dbTask.settings.code;
    dbTask.settings = JSON.stringify(dbTask.settings);
    await tx('tasks').where('id', taskId).update(dbTask);
    if (code) {
        await saveCodeForTask(taskId, code);
    }
}

async function _getTask(tx, id) {
    const taskCodePromise = getCodeForTask(id);
    const taskDbPromise = tx('tasks').where('id', id).first();
    const [task, code] = await Promise.all([taskDbPromise, taskCodePromise]);
    if (task) {
        task.settings = JSON.parse(task.settings);
        task.build_output = JSON.parse(task.build_output);
        task.settings.code = code;
    }
    return task;
}


/**
 * Returns task.
 * @param context
 * @param id the primary key of the task
 * @returns {Promise<any>}
 */
async function getById(context, id) {
    return knex.transaction(async tx => {
        const task = await _getTask(tx, id);
        if (!task || !isBuiltinSource(task.source)) {
            await shares.enforceEntityPermissionTx(tx, context, 'task', id, Permission.VIEW);
        }
        task.permissions = await shares.getPermissionsTx(tx, context, 'task', id);
        return task;
    });
}


async function listSystemDTAjaxWithoutPerms(context, params) {
    shares.enforceGlobalPermission(context, Permission.VIEW_SYSTEM_TASKS);
    return await dtHelpers.ajaxList(
        params,
        getQueryFun(TaskSource.SYSTEM),
        columns
    );
}

/**
 * Builtin tasks are visible to everybody
 * @param params
 * @returns {Promise<*>}
 */
async function listBuiltinDTAjaxWithoutPerms(params) {
    return await dtHelpers.ajaxList(
        params,
        getQueryFun(TaskSource.BUILTIN),
        columns
    );
}

async function listDTAjax(context, params) {
    return await dtHelpers.ajaxListWithPermissions(
        context,
        [{entityTypeId: 'task', requiredOperations: [Permission.VIEW]}],
        params,
        getQueryFun(TaskSource.USER),
        columns
    );
}

/**
 * Create task.
 * @param context
 * @param task
 * @returns {Promise<any>} the primary key of the task
 */
async function create(context, task) {
    const id = await knex.transaction(async tx => {
        await shares.enforceEntityPermissionTx(tx, context, 'namespace', task.namespace, 'createTask');
        await namespaceHelpers.validateEntity(tx, task);

        enforce(Object.values(TaskType).includes(task.type), 'Unknown task type');

        // Settings check
        if (task.settings.subtype) {
            enforce(Object.values(subtypesByType[task.type]).includes(task.settings.subtype), `Unknown ${task.type} type's subtype`);
        }

        const wizard = getWizard(task.type, task.settings.subtype, task.wizard);
        if (wizard != null) {
            wizard(task);
        } else {
            // TODO: We might throw error here instead, might be confusing from UX perspective
            task.settings = {
                ...(task.settings || {}),
                params: [],
                code: ''
            };
        }

        const filteredEntity = filterObject(task, allowedKeysCreate);
        filteredEntity.build_state = BuildState.SCHEDULED;
        filteredEntity.source = TaskSource.USER;

        const id = await _insertTask(tx, filteredEntity);

        await shares.rebuildPermissionsTx(tx, {entityTypeId: 'task', entityId: id});

        return id;
    });

    scheduleInit(id, task.settings);

    return id;
}

/**
 * On task param change invalidate all jobs of that task.
 * @param tx
 * @param taskId the primary key of the task
 * @returns {Promise<void>}
 */
async function invalidateJobs(tx, taskId) {
    await tx('jobs').where('task', taskId).update('state', JobState.INVALID_PARAMS);
}

/**
 * Update task if it hadn't changed on the server.
 * @param context
 * @param task
 * @returns {Promise<void>}
 */
async function updateWithConsistencyCheck(context, task) {
    let uninitialized = false;
    await knex.transaction(async tx => {
        await shares.enforceEntityPermissionTx(tx, context, 'task', task.id, Permission.EDIT);

        const existing = await _getTask(tx, task.id);
        if (!existing) {
            throw new interoperableErrors.NotFoundError();
        }

        uninitialized = (existing.build_state === BuildState.UNINITIALIZED);

        const existingHash = hash(existing);
        if (existingHash !== task.originalHash) {
            throw new interoperableErrors.ChangedError();
        }

        await namespaceHelpers.validateEntity(tx, task);
        await namespaceHelpers.validateMove(context, task, existing, 'task', 'createTask', 'delete');


        await _updateTask(tx, task.id, filterObject(task, allowedKeysUpdate));

        if (hasher.hash(task.settings.params) !== hasher.hash(existing.settings.params)) {
            await invalidateJobs(tx, task.id);
        }

        await shares.rebuildPermissionsTx(tx, {entityTypeId: 'task', entityId: task.id});
    });

    scheduleBuildOrInit(uninitialized, task.id, task.settings)
}

/**
 * Remove task.
 * @param context
 * @param id the primary key of the task
 * @returns {Promise<void>}
 */
async function remove(context, id) {
    await knex.transaction(async tx => {
        await shares.enforceEntityPermissionTx(tx, context, 'task', id, Permission.DELETE);

        await dependencyHelpers.ensureNoDependencies(tx, context, id, [
            {entityTypeId: 'job', column: 'task'}
        ]);

        const task = await tx('tasks').where('id', id).first();

        taskHandler.scheduleTaskDelete(id, task.type);

        // deletes the built files of the task
        await files.removeAllTx(tx, context, 'task', 'file', id);

        await tx('tasks').where('id', id).del();

        // Remove task dir
        await fs.remove(taskHandler.getTaskDir(id));
    });
}

/**
 * Returns parameters of the task
 * @param context
 * @param id the primary key of the task
 * @returns {Promise<any>}
 */
async function getParamsById(context, id) {
    return await knex.transaction(async tx => {
        await shares.enforceEntityPermissionTx(tx, context, 'task', id, Permission.VIEW);
        const entity = await tx('tasks').select(['settings']).where('id', id).first();
        const settings = JSON.parse(entity.settings);
        return settings.params;
    });
}

/**
 * Helper for deciding if initialization is needed or build is sufficient.
 * @param uninitialized whether task is in uninitilized state
 * @param id the primary key of the task
 * @param settings
 */
function scheduleBuildOrInit(uninitialized, id, settings) {
    if (uninitialized) {
        scheduleInit(id, settings);
    } else {
        scheduleBuild(id, settings);
    }
}

function scheduleBuild(id, settings) {
    taskHandler.scheduleBuild(id, settings.code, taskHandler.getTaskBuildOutputDir(id));
}

function scheduleInit(id, settings) {
    taskHandler.scheduleInit(id, settings.code, taskHandler.getTaskBuildOutputDir(id));
}

/**
 * Prepare task for use.
 * @param context
 * @param id the primary key of the task
 * @param forceInit Task is initialized even if not necessary
 * @returns {Promise<void>}
 */
async function compile(context, id, forceInit = false) {
    let task;
    let uninitialized = true;
    await knex.transaction(async tx => {
        await shares.enforceEntityPermissionTx(tx, context, 'task', id, Permission.EDIT);

        task = await _getTask(tx, id);
        if (!task) {
            throw new Error(`Task not found`);
        }

        // Reinitialization can be forced by argument
        uninitialized = forceInit || (task.build_state === BuildState.UNINITIALIZED);

        await tx('tasks').where('id', id).update({build_state: BuildState.SCHEDULED});
    });

    scheduleBuildOrInit(uninitialized, id, task.settings);
}

async function compileAll() {
    const tasks = await knex('tasks');

    for (const task of tasks) {
        const settings = JSON.parse(task.settings);
        if (!settings.code) { // builtin tasks still store code in db
            settings.code = await getCodeForTask(task.id);
        }

        const uninitialized = (task.build_state === BuildState.UNINITIALIZED);
        await knex('tasks').update({build_state: BuildState.SCHEDULED}).where('id', task.id);
        scheduleBuildOrInit(uninitialized, task.id, settings);
    }
}

async function getVcsLogs(context, id) {
    await shares.enforceEntityPermission(context, 'task', id, Permission.VIEW);
    const dir = path.join(taskHandler.getTaskDevelopmentDir(id))
    const git = simpleGit({
        baseDir: dir,
        binary: 'git',
    });

    const logs = await git.log({
        format: {
            hash: "%H",
            msg: "%B",
            date: "%aI"
        }
    });

    return logs.all;
}

async function checkout(context, id, commitHash) {
    await shares.enforceEntityPermission(context, 'task', id, Permission.EDIT);
    const dir = path.join(taskHandler.getTaskDevelopmentDir(id))
    const git = simpleGit({
        baseDir: dir,
        binary: 'git',
    });

    const result = await git.checkout(commitHash);
}


async function commit(context, id, body = {}) {
    const {commitMessage = ''} = body;
    await shares.enforceEntityPermission(context, 'task', id, Permission.EDIT);

    const dir = path.join(taskHandler.getTaskDevelopmentDir(id))
    const git = simpleGit({
        baseDir: dir,
        binary: 'git',
    });
    await git.add(dir)
    await git.commit(commitMessage)
}

async function addRemote(context, id, body = {}) {
    const {remoteUrl} = body;
    await shares.enforceEntityPermission(context, 'task', id, Permission.EDIT);

    const dir = path.join(taskHandler.getTaskDevelopmentDir(id))
    const git = simpleGit({
        baseDir: dir,
        binary: 'git',
    });
    try {
        await git.addRemote('origin', remoteUrl)
    } catch (e) {
        await git.remote(['set-url', 'origin', remoteUrl]);
    }

    try {
        await git.branch(['--set-upstream-to', 'origin/master']);
    } catch (e) {
        throw new Error("the remote must have 'master' branch")
    }
}

async function listRemotes(context, id) {
    await shares.enforceEntityPermission(context, 'task', id, Permission.VIEW);
    const dir = path.join(taskHandler.getTaskDevelopmentDir(id))
    const git = simpleGit({
        baseDir: dir,
        binary: 'git',
    });

    const remotes = await git.getRemotes(true);

    return remotes;
}


async function remotePull(context, id, body = {}) {
    await shares.enforceEntityPermission(context, 'task', id, Permission.EDIT);

    const dir = path.join(taskHandler.getTaskDevelopmentDir(id))
    const git = simpleGit({
        baseDir: dir,
        binary: 'git',
    });
    await git.pull(['--allow-unrelated-histories'])
}


async function remotePush(context, id, body = {}) {
    await shares.enforceEntityPermission(context, 'task', id, Permission.EDIT);

    const dir = path.join(taskHandler.getTaskDevelopmentDir(id))
    const git = simpleGit({
        baseDir: dir,
        binary: 'git',
    });

    await git.push(['origin', 'master'])
}

module.exports.listRemotes = listRemotes;
module.exports.remotePull = remotePull;
module.exports.remotePush = remotePush;
module.exports.addRemote = addRemote;
module.exports.commit = commit;
module.exports.checkout = checkout;
module.exports.getVcsLogs = getVcsLogs;
module.exports.hash = hash;
module.exports.getById = getById;
module.exports.listDTAjax = listDTAjax;
module.exports.create = create;
module.exports.updateWithConsistencyCheck = updateWithConsistencyCheck;
module.exports.remove = remove;
module.exports.getParamsById = getParamsById;
module.exports.compile = compile;
module.exports.compileAll = compileAll;
module.exports.listBuiltinDTAjaxWithoutPerms = listBuiltinDTAjaxWithoutPerms;
module.exports.listSystemDTAjaxWithoutPerms = listSystemDTAjaxWithoutPerms;