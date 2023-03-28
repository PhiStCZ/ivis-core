'use strict';

const fs = require('fs-extra-promise');

/**
 * Returns the content of a file at a given path, or null, if the file doesn't exist.
 */
async function tryGetBuiltinFileContent(path) {
    const fileExists = await fs.existsAsync(path);
    if (fileExists) {
        return await fs.readFileAsync(path, 'utf-8');
    } else {
        return null;
    }
}

module.exports.tryGetBuiltinFileContent = tryGetBuiltinFileContent;
