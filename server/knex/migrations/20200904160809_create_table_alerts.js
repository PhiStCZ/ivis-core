exports.up = (knex, Promise) => (async() => {
    await knex.schema.createTable('alerts', table => {
        table.increments('id').primary();
        table.string('name');
        table.text('description');
        table.integer('sigset').unsigned().notNullable().references('signal_sets.id');
        table.integer('duration').unsigned().notNullable();
        table.integer('delay').unsigned().notNullable();
        table.integer('interval').unsigned();
        table.text('condition');
        table.text('emails');
        table.text('phones');
        table.integer('repeat').unsigned();
        table.boolean('finalnotification').notNullable().defaultTo(false);
        table.boolean('enabled').notNullable().defaultTo(false);
        table.integer('namespace').notNullable().references('namespaces.id');
        table.timestamp('created').defaultTo(knex.fn.now());
    });
})();

exports.down = (knex, Promise) => (async() =>  {
    await knex.schema.dropTable('alerts');
})();
