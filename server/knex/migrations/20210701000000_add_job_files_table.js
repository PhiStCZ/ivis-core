exports.up = (knex, Promise) => (async () => {
    await knex.schema.createTable('files_job_file', table => {
        table.increments('id').primary();
        table.integer('entity').unsigned().notNullable().references('jobs.id').onDelete('CASCADE');
        table.string('filename');
        table.string('originalname');
        table.string('mimetype');
        table.integer('size');
        table.timestamp('created').defaultTo(knex.fn.now());
    })
        .raw('ALTER TABLE `files_job_file` ADD KEY `originalname` (`entity`,`originalname`)');
})();

exports.down = (knex, Promise) => (async () => {
});