exports.up = (knex, Promise) => (async () => {
    await knex.schema.table('jobs', table => {
        table.integer('owner').unsigned().references('users.id');
    });
})();

exports.down = (knex, Promise) => (async () => {
});