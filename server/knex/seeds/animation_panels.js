"use strict";

const fs = require('fs');
const path = require('path');
const promisify = require('bluebird').promisify;
const readFileAsync = promisify(fs.readFile);

const exampleDirs = [
    'recorded_animation_area_bar_charts',
    'recorded_animation_svg_line_pie_charts',
    'live_animation_server_monitor'
].map(
    dirName => path.join(__dirname, '..', '..', '..', 'examples', 'templates', dirName)
);
const templates = [
    {
        name: 'Animated area and bar charts [Recorded]',
        description: 'Template presenting a use case of Recorded animation in combination with area and bar charts.',
        type: 'jsx',
        state: 1,
        namespace: 1
    },
    {
        name: 'Animated SVG, line and pie charts [Recorded]',
        description: 'Template presenting a use case of Recorded animation in combination with SVG graphic, line and pie charts.',
        type: 'jsx',
        state: 1,
        namespace: 1
    },
    {
        name: 'Animated live server monitoring [Live]',
        description: 'Template presenting a use case of Live animation in combination with SVG graphic, line and bar chart s.',
        type: 'jsx',
        state: 1,
        namespace: 1
   }
];
const panels = [
    {
        name: 'COVID development in chosen districts',
        description: 'Comparison of COVID development in various districts in Italy.',
        order: 1,
        template: 10,
        namespace: 1
    },
    {
        name: 'COVID testing in detail',
        description: 'Comparison of COVID testing results in various districts in Italy.',
        order: 2,
        template: 11,
        namespace: 1
    },
    {
        name: 'Live server monitoring',
        description: 'Live monitoring of server\'s resources such as CPU load, memory statistics and disk load.',
        order: 3,
        template: 12,
        namespace: 1
    }
];

const paramsFN = 'params.json';
const jsxFN = 'template.js';
const stylesFN = 'styles.scss';
const panel_configFN = 'panel_config.json';

async function deleteOldPanels(knex) {
    await knex.transaction(async tx => {
        //Deletes templates with name prefixed with 'Animated'
        //Deletes workspace with the name 'Animation'

        await tx('templates').where('name', 'like', 'Animated%').del();

        const workspace = await tx('workspaces').where('name', 'Animation').first('id');
        if (workspace !== undefined) {
            await tx('panels').where('workspace', workspace.id).del();
            await tx('workspaces').where('id', workspace.id).del();
        }
    });
}

exports.seed = knex => (async() => {
    await deleteOldPanels(knex);

    const workspaceId = await knex('workspaces').insert({
        name: 'Animation',
        description: 'Workspace showcasing use cases of Recorded and Live animations.',
        order: 1,
        namespace: 1
    });

    const panelIds = [];

    for (let i = 0; i < exampleDirs.length; i++) {
        const exampleDir = exampleDirs[i];

        const templateSettings = {
            params: JSON.parse(await readFileAsync(path.join(exampleDir, paramsFN), 'utf8')),
            jsx: await readFileAsync(path.join(exampleDir, jsxFN), 'utf8'),
            scss: '',
        };

        try {
            const scss = await readFileAsync(path.join(exampleDir, stylesFN), 'utf8');

            templateSettings.scss = scss;
        } catch (err) {
            if (err.code !== 'ENOENT') console.error(err);
        }

        const templateId = await knex('templates').insert({
            ...templates[i],
            settings: JSON.stringify(templateSettings),
        });

        const panelParams = JSON.parse(await readFileAsync(path.join(exampleDir, panel_configFN), 'utf8'));

        const panelId = await knex('panels').insert({
            ...panels[i],
            workspace: workspaceId,
            template: templateId,
            params: JSON.stringify(panelParams),
        });

        panelIds.push(panelId);
    }

    await knex('workspaces').where('id', workspaceId).update({default_panel: panelIds[0]});
})();
