'use strict';

const knex = require('../lib/knex');
const hasher = require('node-object-hash')();
const {enforce, filterObject} = require('../lib/helpers');
const dtHelpers = require('../lib/dt-helpers');
const interoperableErrors = require('../../shared/interoperable-errors');
const namespaceHelpers = require('../lib/namespace-helpers');
const shares = require('./shares');
const {BuildState, TaskSource, TaskType, subtypesByType} = require('../../shared/tasks');
const {JobState} = require('../../shared/jobs');
const fs = require('fs-extra-promise');
const taskHandler = require('../lib/task-handler');
const files = require('./files');
const dependencyHelpers = require('../lib/dependency-helpers');
const {getWizard} = require("../lib/wizards");

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


/**
 * Returns task.
 * @param context
 * @param id the primary key of the task
 * @returns {Promise<any>}
 */
async function getById(context, id) {
    return await knex.transaction(async tx => {
        const task = await tx('tasks').where('id', id).first();
        if (!task || task.source !== TaskSource.BUILTIN) {
            await shares.enforceEntityPermissionTx(tx, context, 'task', id, 'view');
        }
        task.settings = JSON.parse(task.settings);
        task.build_output = JSON.parse(task.build_output);
        task.permissions = await shares.getPermissionsTx(tx, context, 'task', id);
        return task;
    });
}

async function listDTAjaxWithoutPerms(params) {
    return await dtHelpers.ajaxList(
        params,
        getQueryFun(TaskSource.BUILTIN),
        columns
    );
}

async function listDTAjax(context, params) {
    return await dtHelpers.ajaxListWithPermissions(
        context,
        [{entityTypeId: 'task', requiredOperations: ['view']}],
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
            // We might throw error here instead, might be confusing from UX perspective
            task.settings = {
                ...(task.settings || {}),
                params: [],
                code: ''
            };
        }

        const filteredEntity = filterObject(task, allowedKeysCreate);
        filteredEntity.settings = JSON.stringify(filteredEntity.settings);
        filteredEntity.build_state = BuildState.SCHEDULED;
        filteredEntity.source = TaskSource.USER;

        const ids = await tx('tasks').insert(filteredEntity);
        const id = ids[0];

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
        await shares.enforceEntityPermissionTx(tx, context, 'task', task.id, 'edit');

        const existing = await tx('tasks').where('id', task.id).first();
        if (!existing) {
            throw new interoperableErrors.NotFoundError();
        }

        uninitialized = (existing.build_state === BuildState.UNINITIALIZED);

        existing.settings = JSON.parse(existing.settings);
        const existingHash = hash(existing);
        if (existingHash !== task.originalHash) {
            throw new interoperableErrors.ChangedError();
        }

        await namespaceHelpers.validateEntity(tx, task);
        await namespaceHelpers.validateMove(context, task, existing, 'task', 'createTask', 'delete');

        const filteredEntity = filterObject(task, allowedKeysUpdate);
        filteredEntity.settings = JSON.stringify(filteredEntity.settings);

        if (hasher.hash(task.settings.params) !== hasher.hash(existing.settings.params)) {
            await invalidateJobs(tx, task.id);
        }

        await tx('tasks').where('id', task.id).update(filteredEntity);

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
        await shares.enforceEntityPermissionTx(tx, context, 'task', id, 'delete');

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
        await shares.enforceEntityPermissionTx(tx, context, 'task', id, 'view');
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
 * @returns {Promise<void>}
 */
async function compile(context, id, forceInit = false) {
    let task;
    let uninitialized = true;
    await knex.transaction(async tx => {
        await shares.enforceEntityPermissionTx(tx, context, 'task', id, 'edit');

        task = await tx('tasks').where('id', id).first();
        if (!task) {
            throw new Error(`Task not found`);
        }

        // Reinitialization can be forced by argument
        uninitialized = forceInit || (task.build_state === BuildState.UNINITIALIZED);

        await tx('tasks').where('id', id).update({build_state: BuildState.SCHEDULED});
    });

    const settings = JSON.parse(task.settings);
    scheduleBuildOrInit(uninitialized, id, settings);
}

async function compileAll() {
    const tasks = await knex('tasks');

    for (const task of tasks) {
        const settings = JSON.parse(task.settings);
        const uninitialized = (task.build_state === BuildState.UNINITIALIZED);
        await knex('tasks').update({build_state: BuildState.SCHEDULED}).where('id', task.id);
        scheduleBuildOrInit(uninitialized, task.id, settings);
    }
}

module.exports.hash = hash;
module.exports.getById = getById;
module.exports.listDTAjax = listDTAjax;
module.exports.create = create;
module.exports.updateWithConsistencyCheck = updateWithConsistencyCheck;
module.exports.remove = remove;
module.exports.getParamsById = getParamsById;
module.exports.compile = compile;
module.exports.compileAll = compileAll;
module.exports.listDTAjaxWithoutPerms = listDTAjaxWithoutPerms;
