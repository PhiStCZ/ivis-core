'use strict';

const moment = require('moment');
const https = require('https');
const {getColumnName, getTableName} = require('../../models/signal-storage');
const {SignalType} = require('../../../shared/signals');
const csv = require('csvtojson');

const {getIndexName} = require('../../lib/indexers/elasticsearch-common');
const elasticsearch = require('../../lib/elasticsearch');

const totalRecordLimit = 3000000; //>10000
const insertLimit = 10000;

async function loadJSONFromCsv(url) {
    console.log(`Fetching ${url}`);
    return new Promise((resolve) => {
        https.get(url, res => {
            const data = [];

            let recordNum = 0;
            let resolved = false;

            const done = () => {
                if (resolved) return;

                resolved = true;
                console.log(`Fetching ${url} completed`);
                resolve(data);
            };


            csv({delimiter: ',', trim: true, checkType: true}, {objectMode: true})
                .fromStream(res)
                .on('data', row => {
                    recordNum += 1;
                    if (recordNum <= totalRecordLimit) data.push(row);
                    else done();
                })
                .on('done', done);
        });
    });
}

//Using csvs instead of jsons, because jsons were outdated.
const urls = {
    index: 'https://storage.googleapis.com/covid19-open-data/v2/index.csv',
    demographics: 'https://storage.googleapis.com/covid19-open-data/v2/demographics.csv',
    epidemiology: 'https://storage.googleapis.com/covid19-open-data/v2/epidemiology.csv',
};

async function createSigSet(knex, sigSetCid, data, population, regionName) {
    console.log(`Creating new signal set with cid: ${sigSetCid}`);

    async function deletePrevious() {
        const sigSet = await knex('signal_sets').where({cid: sigSetCid}).first();

        if (sigSet) {
            console.log(`Deleting any previously created signal set with cid ${sigSet.cid}`);
            await knex('signals').where({set: sigSet.id}).del();
            await knex('signal_sets').where({cid: sigSetCid}).del();

            await knex.schema.dropTableIfExists(getTableName(sigSet));

            try {
                await elasticsearch.indices.delete({index: getIndexName(sigSet)});
            } catch (err) {
                if (!err.body || !err.body.error || err.body.error.type !== 'index_not_found_exception') {
                    throw err;
                }
            }
        }
    }

    const tsCid = 'ts';
    const fields = ['current_population', 'new_confirmed', 'new_negative', 'new_tested', 'new_deceased', 'new_recovered', 'new_active_cases',
                                'total_confirmed', 'total_negative', 'total_tested', 'total_deceased', 'total_recovered', 'total_active_cases'];

    await deletePrevious();

    const sigSet = {
        cid: sigSetCid,
        name: regionName,
        settings: JSON.stringify({}),
        state: JSON.stringify({indexing: {status: 1}}),
        namespace: 1
    };
    const ids = await knex('signal_sets').insert(sigSet);
    sigSet.id = ids[0];


    const idMap = {};

    idMap[tsCid] = await knex('signals').insert({
        cid: tsCid,
        name: 'Timestamp',
        type: SignalType.DATE_TIME,
        settings: JSON.stringify({}),
        set: sigSet.id,
        namespace: 1,
    });

    for (const fieldCid of fields) {
        idMap[fieldCid] = await knex('signals').insert({
            cid: fieldCid,
            name: fieldCid.charAt(0).toUpperCase() + fieldCid.substring(1).split('_').join(' '),
            type: SignalType.INTEGER,
            settings: JSON.stringify({}),
            set: sigSet.id,
            namespace: 1
        });
    }

    const signalTableName = getTableName(sigSet);
    await knex.schema.createTable(signalTableName, table => {
        table.increments('id');
        table.specificType(getColumnName(idMap[tsCid]), 'datetime(0)').notNullable().index();


        for (const fieldCid of fields) {
            table.specificType(getColumnName(idMap[fieldCid]), 'int');
        }
    });

    function *rowGenerator() {
        for (const row of data) {
            const new_confirmed = row.new_confirmed;
            const new_tested = Math.max(row.new_tested, new_confirmed);

            const new_deceased = row.new_deceased;
            const new_recovered = row.new_recovered;

            const total_confirmed = row.total_confirmed;
            const total_tested = Math.max(row.total_tested, total_confirmed);

            const total_deceased = row.total_deceased;
            const total_recovered = row.total_recovered;

            yield {
                [getColumnName(idMap[tsCid])]: moment.utc(row.date).toDate(),
                [getColumnName(idMap.current_population)]: population - total_deceased,

                [getColumnName(idMap.new_confirmed)]: new_confirmed,
                [getColumnName(idMap.new_tested)]: new_tested,
                [getColumnName(idMap.new_negative)]: new_tested - new_confirmed,

                [getColumnName(idMap.new_deceased)]: new_deceased,
                [getColumnName(idMap.new_recovered)]: new_recovered,
                [getColumnName(idMap.new_active_cases)]: new_confirmed - new_deceased - new_recovered,

                [getColumnName(idMap.total_confirmed)]: total_confirmed,
                [getColumnName(idMap.total_tested)]: total_tested,
                [getColumnName(idMap.total_negative)]: total_tested - total_confirmed,

                [getColumnName(idMap.total_deceased)]: total_deceased,
                [getColumnName(idMap.total_recovered)]: total_recovered,
                [getColumnName(idMap.total_active_cases)]: total_confirmed - total_deceased - total_recovered,
            };
        }
    }

    let rows = [];
    for (const row of rowGenerator()) {
        rows.push(row);

        if (rows.length >= insertLimit) {
            console.log(`Inserting ${rows.length} to signal set ${sigSet.cid}`);
            await knex(signalTableName).insert(rows);
            rows = [];
        }
    }

    if (rows.length > 0) {
        console.log(`Inserting ${rows.length} to signal set ${sigSet.cid}`);
        await knex(signalTableName).insert(rows);
    }
}

exports.seed = (knex) => (async () => {
    const [indexData, demographicsData, epidemiologyData] = await Promise.all([
        loadJSONFromCsv(urls.index),
        loadJSONFromCsv(urls.demographics),
        loadJSONFromCsv(urls.epidemiology)
    ]);

    const italyKeysToFilter = new Set(
        indexData.filter(datum => datum.key
            .startsWith('IT') && datum.aggregation_level < 2)
            .map(datum => datum.key)
        );

    console.log(indexData);
    function filterData(data) {
        return data.filter(datum => italyKeysToFilter.has(datum.key)).map(datum => {
            datum.key = datum.key.toLowerCase()
            return datum;
        });
    }

    function eliminateNegativeValues(data, keys) {
        const negatives = {};
        for (const key of keys) {
            negatives[key] = 0;
        }

        for (let i = data.length - 1; i >= 0; i--) {
            const row = data[i];

            for (const key of keys) {
                if (negatives[key] === 0 && row[key] >= 0) continue;

                if (row[key] === '') row[key] = 0;
                row[key] += negatives[key];
                negatives[key] = 0;

                if (row[key] < 0) {
                    negatives[key] = row[key];
                    row[key] = 0;
                }
            }
        }
    }

    function emptyToZeros(data) {
        for (const row of data) {
            for (const key of Object.keys(row)) {
                if (row[key] === '') row[key] = 0;
            }
        }
    }

    const index = filterData(indexData);
    const demographics = filterData(demographicsData);
    const epidemiology = filterData(epidemiologyData);

    const regionMap = {};
    const regionKeys = [];
    italyKeysToFilter.forEach(str => regionKeys.push(str.toLowerCase()));
    for (const datum of index) {
        regionMap[datum.key] = {
            name: datum.subregion1_name || datum.country_name,
            epidemiology: [],
        };
    }

    for (const datum of demographics) {
        regionMap[datum.key].population = datum.population;
    }

    for (const datum of epidemiology) {
        regionMap[datum.key].epidemiology.push(datum);

    }


    for (const regKey of regionKeys) {
        emptyToZeros(regionMap[regKey].epidemiology);
        eliminateNegativeValues(
                regionMap[regKey].epidemiology,
                ['new_confirmed', 'new_deceased', 'new_recovered']
        );
    }

    for (const regionKey of regionKeys) {
        const regionData = regionMap[regionKey];
        await createSigSet(knex, regionKey, regionData.epidemiology, regionData.population, regionData.name);
    }
})();

