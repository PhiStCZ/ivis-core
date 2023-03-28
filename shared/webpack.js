'use strict';
const slugify = require('slugify');

const externalsLibs = [
    'react',
    'moment',
    'prop-types',
    'd3-color',
    'd3-zoom',
    'd3-format',
    'd3-selection',
    'd3-array',
    'd3-axis',
    'd3-scale',
    'd3-shape',
    'd3-scale-chromatic',
];

const internalLibs = {
    'axios': 'lib/axios',
    'ivis': 'ivis/ivis',
    'decorator-helpers': 'lib/decorator-helpers',
    'bootstrap-components': 'lib/bootstrap-components',
};

const libs = [];

for (const lib of externalsLibs) {
    const id = 'ivisExports_' + slugify(lib, '_').replace(/-/g, '_');
    libs.push({
        id,
        lib,
        path: lib,
        type: 'external'
    });
}

for (const lib in internalLibs) {
    const id = 'ivisExports_' + slugify(lib, '_').replace(/-/g, '_');
    libs.push({
        id,
        lib,
        path: internalLibs[lib],
        type: 'internal'
    });
}

module.exports.libs = libs;



