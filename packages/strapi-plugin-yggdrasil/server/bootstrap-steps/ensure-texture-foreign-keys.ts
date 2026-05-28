import type { StrapiInstance } from '../types';

const TEXTURE_TABLES = ['yggdrasil_player_skins', 'yggdrasil_player_capes'] as const;

export const ensureTextureForeignKeys = async (strapi: StrapiInstance): Promise<void> => {
  const knex = strapi.db.connection;
  for (const table of TEXTURE_TABLES) {
    if (!(await knex.schema.hasTable(table))) continue;
    const constraintName = `${table}_user_fk`;
    try {
      await knex.raw(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} FOREIGN KEY ("userId") REFERENCES up_users(id) ON DELETE CASCADE`,
      );
      strapi.log.info(`[yggdrasil] added FK ${constraintName}`);
    } catch (err) {
      strapi.log.debug(
        `[yggdrasil] FK ${constraintName} not added (already present or backend unsupported): ${
          (err as Error).message
        }`,
      );
    }
  }
};
