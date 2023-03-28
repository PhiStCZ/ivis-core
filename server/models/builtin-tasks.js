'use strict';

const knex = require('../lib/knex');
const path = require('path');
const fs = require('fs-extra-promise');
const {getVirtualNamespaceId} = require("../../shared/namespaces");
const {BuiltinTaskNames, TaskSource, BuildState, TaskType, PYTHON_BUILTIN_CODE_FILE_NAME, PYTHON_BUILTIN_PARAMS_FILE_NAME} = require("../../shared/tasks");
const em = require('../lib/extension-manager');

// code is loaded from file
const aggregationTask = {
    name: BuiltinTaskNames.AGGREGATION,
    description: 'Task used by aggregation feature for signal sets',
    type: TaskType.PYTHON,
    source: TaskSource.SYSTEM,
    settings: {
        builtin_reinitOnUpdate: true,
        params: [{
            "id": "signalSet",
            "type": "signalSet",
            "label": "Signal Set",
            "help": "Signal set to aggregate",
            "includeSignals": true
        }, {
            "id": "ts",
            "type": "signal",
            "signalSetRef": "signalSet",
            "label": "Timestamp signal",
            "help": "Timestamp for aggregation"
        }, {
            "id": "offset",
            "type": "string",
            "label": "Offset",
            "help": "Since when should aggregation be done"
        }, {
            "id": "interval",
            "type": "string",
            "label": "Interval",
            "help": "Bucket interval"
        }],
    },
};

const flattenTask = {
    name: BuiltinTaskNames.FLATTEN,
    description: 'Task will combine specified signals into single signal set and resolve conflicts on the same time point with the chosen method',
    type: TaskType.PYTHON,
    settings: {
        builtin_reinitOnUpdate: true,
        params: [
            {
                "id": "resolutionMethod",
                "type": "option",
                "label": "Resolution method",
                "help": "Conflict resolution method",
                "options": [
                    {
                        "key": "avg",
                        "label": "Avarage"
                    },
                    {
                        "key": "min",
                        "label": "Minimum"
                    },
                    {
                        "key": "max",
                        "label": "Maximum"
                    }
                ]
            },
            {
                "id": "sets",
                "label": "Signal sets",
                "help": "Signal sets to flatten",
                "type": "fieldset",
                "cardinality": "2..n",
                "children": [
                    {
                        "id": "cid",
                        "label": "Signal set",
                        "type": "signalSet"
                    },
                    {
                        "id": "ts",
                        "type": "signal",
                        "label": "Timestamp",
                        "cardinality": "1",
                        "signalSetRef": "cid"
                    },
                    {
                        "id": "signals",
                        "type": "signal",
                        "label": "Signals",
                        "cardinality": "1..n",
                        "signalSetRef": "cid"
                    }
                ]
            },
            {
                "id": "signalSet",
                "label": "New signal set properties",
                "help": "Resulting signal set",
                "type": "fieldset",
                "cardinality": "1",
                "children": [
                    {
                        "id": "cid",
                        "label": "CID",
                        "type": "string",
                        "isRequired": true
                    },
                    {
                        "id": "namespace",
                        "label": "Namespace",
                        "help": "id of namespace",
                        "type": "number"
                    },
                    {
                        "id": "name",
                        "label": "Name",
                        "type": "string"
                    },
                    {
                        "id": "description",
                        "label": "Description",
                        "type": "string"
                    }
                ]
            }
        ],
    },
};

/**
 * All default builtin tasks
 */
const builtinTasks = [
    aggregationTask,
    flattenTask,
];

async function getBuiltinTask(name) {
    return await knex.transaction(async tx => {
        return await checkExistence(tx, name)
    });
}

/**
 * Check if builtin in task with given name already exists
 * @param tx
 * @param name
 * @return {Promise<any>} undefined if not found, found task otherwise
 */
async function checkExistence(tx, name) {
    return await tx('tasks')
        .where({
            name: name
        })
        .whereIn('source', [TaskSource.BUILTIN, TaskSource.SYSTEM])
        .first();
}

/**
 * Store given task as a builtin task to system
 * @param tx
 * @param builtinTask task to add
 * @return {Promise<void>}
 */
async function addBuiltinTask(tx, builtinTask) {
    const task = {...builtinTask};
    // Only Builtin or system tasks allowed here
    if (builtinTask.source === TaskSource.SYSTEM) {
        task.source = TaskSource.SYSTEM;
    } else {
        task.source = TaskSource.BUILTIN;
    }
    task.namespace = getVirtualNamespaceId();
    task.settings = JSON.stringify(task.settings);
    task.build_state = BuildState.UNINITIALIZED;
    await tx('tasks').insert(task);
}

/**
 * Update existing task
 * @param tx
 * @param id of existing task
 * @param builtinTask columns being updated
 * @param reinit
 * @return {Promise<void>}
 */
async function updateBuiltinTask(tx, id, builtinTask, reinit = false) {
    const task = {...builtinTask};
    if (builtinTask.source === TaskSource.SYSTEM) {
        task.source = TaskSource.SYSTEM;
    } else {
        task.source = TaskSource.BUILTIN;
    }
    task.namespace = getVirtualNamespaceId();
    task.settings = JSON.stringify(task.settings);
    if (reinit) {
        task.build_state = BuildState.UNINITIALIZED;
    }
    await tx('tasks').where('id', id).update(task);
}

/**
 * Add code and params to a task from a given builtin task directory which
 * contains the task's code.py or params.json .
 * @param builtinTask the task to add code and params to
 * @param builtinTaskDirPath path to the task's directory
 */
async function ensureCodeAndParamsForBuiltinTask(builtinTask, builtinTaskDirPath) {
    if (!builtinTask.settings) {
        builtinTask.settings = {};
    }

    const codeFile = path.join(builtinTaskDirPath, PYTHON_BUILTIN_CODE_FILE_NAME);
    if (!builtinTask.settings.code) {
        builtinTask.settings.code = await tryGetBuiltinFileContent(codeFile) || '';
    }

    const paramsFile = path.join(builtinTaskDirPath, PYTHON_BUILTIN_PARAMS_FILE_NAME);
    if (!builtinTask.settings.params) {
        builtinTask.settings.params = JSON.parse(await tryGetBuiltinFileContent(paramsFile) || '[]');
    }
}

/**
 * Check if all default builtin tasks are in the system / set them to default state
 * @return {Promise<void>}
 */
async function storeBuiltinTasks() {
    for (const builtinTask of builtinTasks) {
        tasks = [tasks];
        const builtinTaskPath = path.join(__dirname, '..', 'builtin-files', builtinTask.name);
        await ensureCodeAndParamsForBuiltinTask(builtinTask, builtinTaskPath);
    }

    await em.invokeAsync('builtinTasks.add', builtinTasks);

    await addTasks(builtinTasks);
}

/**
 * Add given tasks as builtin tasks
 * @param tasks
 * @return {Promise<void>}
 */
async function addTasks(tasks) {
    if (!Array.isArray(tasks)) {
        tasks = [tasks];
    }

    for (const task of tasks) {
        await knex.transaction(async tx => {
            const exists = await checkExistence(tx, task.name);
            if (!exists) {
                await addBuiltinTask(tx, task);
            } else {
                const reinit = (task.settings.builtin_reinitOnUpdate === true)
                delete task.settings.builtin_reinitOnUpdate;
                await updateBuiltinTask(tx, exists.id, task, reinit);
            }
        });
    }
}

/**
 * List all builtin tasks currently in the system
 * @return {Promise<any>}
 */
async function list() {
    const tasks = await knex('tasks').where({source: TaskSource.BUILTIN});
    tasks.forEach(task => task.settings = JSON.parse(task.settings));
    return tasks;
}

module.exports.list = list;
module.exports.ensureCodeAndParamsForBuiltinTask = ensureCodeAndParamsForBuiltinTask;
module.exports.storeBuiltinTasks = storeBuiltinTasks;
module.exports.getBuiltinTask = getBuiltinTask;
