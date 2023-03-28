exports.up = (knex, Promise) => (async() => {
    await knex.schema.table('alerts', table => {
        table.string('state').notNullable().defaultTo('good');
        table.timestamp('state_changed').notNullable().defaultTo(knex.fn.now());
    });
})();

exports.down = (knex, Promise) => (async() =>  {
})();
