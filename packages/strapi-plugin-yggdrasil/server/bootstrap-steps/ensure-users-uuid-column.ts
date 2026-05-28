import type { StrapiInstance } from '../types';

export const ensureUsersUuidColumn = async (strapi: StrapiInstance): Promise<void> => {
  const knex = strapi.db.connection;
  if (!(await knex.schema.hasColumn('up_users', 'uuid'))) {
    strapi.log.info('[yggdrasil] Adding `uuid` column to up_users');
    await knex.schema.alterTable('up_users', (table) => {
      table.string('uuid', 32).nullable();
    });
  }
  try {
    await knex.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS up_users_uuid_uniq ON up_users (uuid) WHERE uuid IS NOT NULL',
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    strapi.log.debug(
      `[yggdrasil] Partial uuid index not supported, trying plain unique index: ${reason}`,
    );
    try {
      await knex.raw('CREATE UNIQUE INDEX up_users_uuid_uniq ON up_users (uuid)');
    } catch (fallbackErr) {
      const reason = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      strapi.log.warn(`[yggdrasil] Could not create unique index on up_users.uuid: ${reason}`);
    }
  }
};
