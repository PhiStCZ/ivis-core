exports.up = (knex, Promise) => (async() => {
    await knex.schema.table('alerts', table => {
        table.timestamp('interval_time').notNullable().defaultTo(knex.fn.now());
    });
})();

exports.down = (knex, Promise) => (async() =>  {
})();
