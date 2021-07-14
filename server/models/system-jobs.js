'use strict';

const knex = require('../lib/knex');
const fs = require('fs-extra-promise');
const {getVirtualNamespaceId} = require("../../shared/namespaces");
const {BuiltinTaskNames, TaskSource} = require("../../shared/tasks");
const {JobState} = require("../../shared/jobs");
const em = require('../lib/extension-manager');


/**
 * All default system jobs
 */
const systemJobs = [
];

em.on('systemJobs.add', addJobs);

async function getSystemJob(name) {
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
    return await tx('jobs')
        .where('name', name)
        .where('namespace', getVirtualNamespaceId())
        .first();
}

/**
 * Store given task as a builtin task to system
 * @param tx
 * @param systemJob
 * @return {Promise<void>}
 */
async function addSystemJob(tx, systemJob) {
    const job = {...systemJob};
    job.namespace = getVirtualNamespaceId();
    job.state = JobState.ENABLED;
    job.params = JSON.stringify(job.params);
    if (typeof job.task !== "number") {
        const taskExists = await tx('tasks')
            .where({
                namespace: getVirtualNamespaceId(),
                name: job.task
            })
            .first();

        if (!taskExists) {
            throw new Error(`Task not found for job ${job.name}`)
        }
        job.task = taskExists.id;
    }
    await tx('jobs').insert(job);
}

/**
 * Update existing task
 * @param tx
 * @param id of existing task
 * @param systemJob columns being updated
 * @return {Promise<void>}
 */
async function updateSystemJob(tx, id, systemJob) {
    const job = {...systemJob};
    delete job.task;
    job.namespace = getVirtualNamespaceId();
    job.params = JSON.stringify(job.params);
    await tx('jobs').where('id', id).update(job);
}

/**
 * Check if all default builtin tasks are in the system / set them to default state
 * @return {Promise<void>}
 */
async function storeSystemJobs() {
    await addJobs(systemJobs);
}

/**
 * Add given tasks as builtin tasks
 * @param jobs
 * @return {Promise<void>}
 */
async function addJobs(jobs) {
    // TODO add check for system tasks
    if (!Array.isArray(jobs)) {
        jobs = [jobs];
    }

    for (const job of jobs) {
        await knex.transaction(async tx => {
            const exists = await checkExistence(tx, job.name);
            if (!exists) {
                await addSystemJob(tx, job);
            } else {
                await updateSystemJob(tx, exists.id, job);
            }
        });
    }
}

/**
 * List all system jobs currently in the system
 * @return {Promise<any>}
 */
async function list() {
    const jobs = await knex('jobs').innerJoin('tasks', 'tasks.id', 'jobs.task').where('tasks.source', TaskSource.SYSTEM);
    jobs.forEach(job => job.params = JSON.parse(job.params));
    return jobs;
}

module.exports.list = list;
module.exports.storeSystemJobs = storeSystemJobs;
module.exports.getSystemJob = getSystemJob;
