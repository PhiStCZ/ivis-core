const moment = require('moment');

const knex = (table) => {
    if (table === 'signal_sets') return { where: (a, b) => {return {first: (c) => {return {cid: b.toString()}}}}};
    if (table === 'signals') return { where: (a, b) => {return {select: (c) => {return [{cid: "siga"}, {cid: "sigb"}, {cid: "sigc"}]}}}};
    if (table === 'alerts_log') return { insert: function(){} };
    if (table === 'alerts') return { where: (a, b) => {return {update: () => {}, first: () => {const time = moment().format('YYYY-MM-DD HH:mm:ss'); return {state_changed: time, interval_time: time}}}}};
};

knex.transaction = async (callback) => { await callback(knex) };

module.exports = knex;
