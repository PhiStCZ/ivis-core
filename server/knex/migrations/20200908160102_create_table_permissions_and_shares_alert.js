exports.up = (knex, Promise) => (async() => {
    await knex.schema.createTable('permissions_alert', table => {
        table.integer('entity').unsigned().notNullable().references('alerts.id').onDelete('CASCADE');
        table.integer('user').unsigned().notNullable().references('users.id').onDelete('CASCADE');
        table.string('operation', 128).notNullable();
        table.primary(['entity', 'user', 'operation']);
    });

    await knex.schema.createTable('shares_alert', table => {
        table.integer('entity').unsigned().notNullable().references('alerts.id').onDelete('CASCADE');
        table.integer('user').unsigned().notNullable().references('users.id').onDelete('CASCADE');
        table.string('role', 128).notNullable();
        table.boolean('auto').defaultTo(false);
        table.primary(['entity', 'user']);
    });
})();

exports.down = (knex, Promise) => (async() =>  {
    await knex.schema.dropTable('permissions_alert');
    await knex.schema.dropTable('shares_alert');
})();
