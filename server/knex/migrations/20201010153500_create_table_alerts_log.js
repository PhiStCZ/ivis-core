exports.up = (knex, Promise) => (async() => {
    await knex.schema.createTable('alerts_log', table => {
        table.increments('id').primary();
        table.integer('alert').unsigned().notNullable().references('alerts.id').onDelete('CASCADE');
        table.string('type').notNullable();
        table.timestamp('time').defaultTo(knex.fn.now());
    });
})();

exports.down = (knex, Promise) => (async() =>  {
    await knex.schema.dropTable('alerts_log');
})();
