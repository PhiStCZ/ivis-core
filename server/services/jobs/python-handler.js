'use strict';
const path = require('path');
const fs = require('fs-extra-promise');
const spawn = require('child_process').spawn;
const {PythonSubtypes, defaultSubtypeKey, PYTHON_JOB_FILE_NAME: JOB_FILE_NAME} = require('../../../shared/tasks');
const readline = require('readline');
const ivisConfig = require('../../lib/config');
const em = require('../../lib/extension-manager');
const log = require('../../lib/log');
const simpleGit = require('simple-git');

// Directory name where virtual env is saved for task
const ENV_NAME = 'env';
const IVIS_PCKG_DIR = path.join(__dirname, '..', '..', 'lib', 'tasks', 'python', 'ivis', 'dist');

const runningProc = new Map();

// const defaultPythonLibs = ivisConfig.tasks.python.defaultPythonLibs;
const defaultPythonLibs = ['elasticsearch', 'requests'];
const taskSubtypeSpecs = {
    [defaultSubtypeKey]:{
        libs: [...defaultPythonLibs]
    },
    [PythonSubtypes.ENERGY_PLUS]: {
        libs: [...defaultPythonLibs, 'eppy', 'requests']
    },
    [PythonSubtypes.NUMPY]: {
        libs: [...defaultPythonLibs, 'numpy', 'dtw']
    },
    [PythonSubtypes.PANDAS]: {
        libs: [...defaultPythonLibs, 'pandas']
    },
    //...ivisConfig.tasks.python.subtypes
};

em.invoke('services.task-handler.python-handler.installSubtypeSpecs', taskSubtypeSpecs);

/**
 * Run job
 * @param id Job id
 * @param runId Run ID, will be used by stop command
 * @param taskDir Directory with the task
 * @param onEvent
 * @param onSuccess Callback on successful run
 * @param onFail callback on failed run
 * @returns {Promise<void>}
 */
async function run({jobId, runId, taskDir, inputData}, onEvent, onSuccess, onFail) {
    try {
        let errOutput = '';



        const pythonExec = path.join(taskDir, '..', ENV_NAME, 'bin', 'python');
        const jobProc = spawn(`${pythonExec} ${JOB_FILE_NAME}`, {
            cwd: taskDir,
            shell: '/bin/bash',
            stdio: ['pipe', 'pipe', 'pipe', 'pipe']
        });

        const jobOutStream = readline.createInterface({
            input: jobProc.stdio[3]
        });

        jobOutStream.on('line', (input) => {
            onEvent('request', input)
                .then(msg => {
                    jobProc.stdin.write(JSON.stringify(msg) + '\n');
                })
                .catch(err => {
                    errOutput += err;
                });
        });

        runningProc.set(runId, jobProc);
        let storeConfig = null;

        // Send all configs and params to process on stdin in json format
        jobProc.stdin.write(JSON.stringify(inputData) + '\n');

        // Error output is just gathered throughout the run and stored after run is done
        jobProc.stderr.on('data', (data) => {
            errOutput += data + '\n';
        });

        // Same as with error output
        jobProc.stdout.on('data', (data) => {
            const outputStr = data.toString();
            onEvent('output', outputStr);
        });

        const pipeErrHandler = (err) => {
            errOutput += err;
            onEvent('output', err.toString());
            log.error(err);
        };

        jobProc.stdin.on('error', pipeErrHandler);
        jobProc.stderr.on('error', pipeErrHandler);
        jobProc.stdout.on('error', pipeErrHandler);
        jobProc.stdio[3].on('error', pipeErrHandler);

        jobProc.on('error', (err) => {
            runningProc.delete(runId);
            const failMsg = [err.toString(), 'Error log:\n' + errOutput].join('\n\n');
            onFail(failMsg);
        });

        jobProc.on('exit', (code, signal) => {
            runningProc.delete(runId);
            if (code === 0) {
                onSuccess(storeConfig);
            } else {
                const failMsg = [`Run failed with code ${code}`, 'Error log:\n' + errOutput].join('\n\n');
                onFail(failMsg);
            }
        });
    } catch (error) {
        onFail([error.toString()]);
    }
}


/**
 * Remove job
 * @param id
 * @returns {Promise<void>}
 */
async function remove(id) {
    // Nothing
}

function getPackages(subtype) {
    return subtype ? taskSubtypeSpecs[subtype].libs : defaultPythonLibs;
}

function getCommandsBefore(subtype) {
    return subtype ? taskSubtypeSpecs[subtype].cmdsBefore : null;
}

function getCommandsAfter(subtype) {
    return subtype ? taskSubtypeSpecs[subtype].cmds : null;
}

function getDevDir(destDir) {
    return path.join(destDir, '..', 'dist');
}

/**
 * Build task
 * @param config
 * @param onSuccess Callback on success
 * @param onFail Callback on failed build
 * @returns {Promise<void>}
 */
async function build(config, onSuccess, onFail) {
    const {id, code, destDir} = config;
    let devDir = getDevDir(destDir);
    try {
        await fs.writeFileAsync(path.join(devDir, JOB_FILE_NAME), code);
        if (devDir != destDir) {
            await fs.copyAsync(devDir, destDir, {overwrite: true});
        }
        const git = simpleGit({
            baseDir: devDir,
            binary: 'git',
            maxConcurrentProcesses: 6,
        });
        const isRepo = await git.checkIsRepo("root");
        if (!isRepo) {
            await git.init();
            // TODO take this somehow from instance config, so it can be instance specific
            await git.addConfig("user.email", "admin@example.com");
            await git.addConfig("user.name", "ivis-core");
        }
        await git.add(devDir)
        await git.commit('Building')
        await onSuccess(null);
    } catch (error) {
        onFail(null, [error.toString()]);
    }
}

function getInitScript(subtype, envBuildDir) {
    const packages = getPackages(subtype);
    const commandsBefore = getCommandsBefore(subtype);
    const commandsAfter = getCommandsAfter(subtype);

    const virtDir = path.join(envBuildDir, 'bin', 'activate');

    const cmdsChain = []
    cmdsChain.push(`${ivisConfig.tasks.python.venvCmd} ${envBuildDir}`)
    cmdsChain.push(`source ${virtDir}`)
    if (commandsBefore) {
        cmdsChain.push(...commandsBefore)
    }
    if (packages) {
        cmdsChain.push(`pip install ${packages.join(' ')} `)
    }
    if (commandsAfter) {
        cmdsChain.push(...commandsAfter)
    }
    cmdsChain.push(`pip install --no-index --find-links=${IVIS_PCKG_DIR} ivis `)
    cmdsChain.push(`deactivate`)

    return cmdsChain.join(' && ');
}

/**
 * Initialize and build task.
 * @param config
 * @param onSuccess Callback on success
 * @param onFail Callback on failed attempt
 * @returns {Promise<void>}
 */
async function init(config, onSuccess, onFail) {
    const {id, subtype, code, destDir} = config;
    try {
        const envBuildDir = path.join(destDir, '..', 'envbuild');
        await fs.emptyDirAsync(envBuildDir);

        const devDir = getDevDir(destDir);
        await fs.ensureDirAsync(devDir)

        const git = simpleGit({
            baseDir: devDir,
            binary: 'git',
            maxConcurrentProcesses: 6,
        });

        const isRepo = await git.checkIsRepo("root");
        if (!isRepo) {
            await git.init();
            // TODO take this somehow from instance config, so it can be instance specific
            await git.addConfig("user.email", "admin@example.com");
            await git.addConfig("user.name", "ivis-core");
        }
        const codeFilePath = path.join(devDir, JOB_FILE_NAME)
        await fs.writeFileAsync(codeFilePath, code);
        await git.add(devDir)
        await git.commit('Init')

        const virtEnv = spawn(
            getInitScript(subtype, envBuildDir),
            {
                shell: '/bin/bash'
            }
        );

        virtEnv.on('error', async (error) => {
            log.error(error)
            onFail(null, [error.toString()]);
            await fs.removeAsync(envBuildDir);
        });

        let output = '';
        virtEnv.stderr.setEncoding('utf8');
        virtEnv.stderr.on('data', data => {
            output += data.toString();
        });

        virtEnv.stdout.setEncoding('utf8');
        virtEnv.stdout.on('data', data => {
            output += data.toString();
        });

        virtEnv.on('exit', async (code, signal) => {
            try {
                if (code === 0) {
                    const envDir = path.join(destDir, '..', ENV_NAME);
                    await fs.ensureDirAsync(envDir)
                    await fs.ensureDirAsync(destDir)

                    if (devDir != destDir) {
                        await fs.copyAsync(devDir, destDir, {overwrite: true});
                    }
                    await fs.moveAsync(envBuildDir, envDir, {overwrite: true});
                    await onSuccess(null);
                } else {
                    await onFail(null, [`Init ended with code ${code} and the following error:\n${output}`]);
                }

                await fs.removeAsync(envBuildDir);
            } catch (error) {
                log.error(error);
            }
        });
    } catch (error) {
        log.error(error);
        onFail(null, [error.toString()]);
    }
}

/**
 * Stop running job
 * @param runId
 * @returns {Promise<void>}
 */
async function stop(runId) {
    const proc = runningProc.get(runId);
    if (proc) {
        proc.kill('SIGINT');
    }
    // TODO check the possibilty of run being on event loop
    // meaning that there is no runningProc registered on that id, but the run is in wait
    // as run is async function and job-handler doest not await on it

}

module.exports = {
    run,
    remove,
    build,
    init,
    stop
};

