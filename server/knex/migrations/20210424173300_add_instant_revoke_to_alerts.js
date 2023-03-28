exports.up = (knex, Promise) => (async() => {
    await knex.schema.table('alerts', table => {
        table.boolean('instant_revoke').notNullable().defaultTo(false);
    });
})();

exports.down = (knex, Promise) => (async() =>  {
})();
