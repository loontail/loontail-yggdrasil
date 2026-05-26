import { runSkinsRegistryMerge } from './migrations/skins-registry-merge';
import type { CryptoService } from './services/crypto';
import type { JoinSessionsService } from './services/join-sessions';
import type { TokensService } from './services/tokens';
import type { StrapiInstance } from './types';

const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Handles held by the plugin runtime that must be released on
 * `destroy` (hot reload, graceful shutdown). Tracked per-Strapi
 * instance via {@link runtimeHandles}.
 */
type RuntimeHandles = {
  stopTokenCleanup(): void;
};

const runtimeHandles = new WeakMap<StrapiInstance, RuntimeHandles>();

const ROUTE_ACTIONS = [
  'plugin::yggdrasil.root.meta',
  'plugin::yggdrasil.authserver.authenticate',
  'plugin::yggdrasil.authserver.refresh',
  'plugin::yggdrasil.authserver.validate',
  'plugin::yggdrasil.authserver.invalidate',
  'plugin::yggdrasil.sessionserver.join',
  'plugin::yggdrasil.sessionserver.hasJoined',
  'plugin::yggdrasil.sessionserver.profile',
  'plugin::yggdrasil.api.bulkProfiles',
  // Public read for skin/cape URLs by UUID. Mutation routes do not
  // need a Public-role grant — they're token-protected (auth:false)
  // and Strapi only checks the role permissions for routes that go
  // through the users-permissions auth chain.
  'plugin::yggdrasil.textures.getTextures',
  // Self mutations (token-protected; declared with auth:false so
  // Strapi skips its u-p chain and runs only the yggdrasil-token-auth
  // policy). Public-role grants make the routes reachable without
  // a u-p JWT.
  'plugin::yggdrasil.textures.uploadSkin',
  'plugin::yggdrasil.textures.uploadCape',
  'plugin::yggdrasil.textures.deleteSkin',
  'plugin::yggdrasil.textures.deleteCape',
] as const;

const TEXTURE_TABLES = ['yggdrasil_player_skins', 'yggdrasil_player_capes'] as const;

/**
 * Add `userId → up_users(id)` foreign keys with `ON DELETE CASCADE`
 * so removing a user wipes their textures rows in the same statement.
 * Failures are non-fatal — SQLite cannot add constraints after the
 * fact, and on backends where the FK already exists the statement
 * throws a duplicate-name error we can safely ignore.
 */
const ensureTextureForeignKeys = async (strapi: StrapiInstance): Promise<void> => {
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

/**
 * Ensure the additive `uuid` column and its partial unique index
 * exist on `up_users`. Idempotent so it is safe to run on every boot.
 */
const ensureUpUsersUuidColumn = async (strapi: StrapiInstance): Promise<void> => {
  const knex = strapi.db.connection;
  if (!(await knex.schema.hasColumn('up_users', 'uuid'))) {
    strapi.log.info('[yggdrasil] Adding `uuid` column to up_users');
    await knex.schema.alterTable('up_users', (table) => {
      table.string('uuid', 32).nullable();
    });
  }
  // Partial unique index is Postgres-specific syntax. Other backends
  // would need adapting; for now we silently warn on failure rather
  // than blow up boot — Strapi's app-level unique still catches dupes.
  try {
    await knex.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS up_users_uuid_uniq ON up_users (uuid) WHERE uuid IS NOT NULL',
    );
  } catch (err) {
    strapi.log.warn(
      `[yggdrasil] Could not create partial unique index on up_users.uuid: ${(err as Error).message}`,
    );
  }
};

/**
 * Grant the Public role permission to invoke each Yggdrasil route.
 * Idempotent — only creates the rows that are missing.
 */
const grantPublicPermissions = async (strapi: StrapiInstance): Promise<void> => {
  const roleQuery = strapi.db.query('plugin::users-permissions.role');
  const permissionQuery = strapi.db.query('plugin::users-permissions.permission');
  const publicRole = (await roleQuery.findOne({ where: { type: 'public' } })) as {
    id: number;
  } | null;
  if (!publicRole) {
    strapi.log.warn('[yggdrasil] Public role not found; skipping permissions setup');
    return;
  }
  for (const action of ROUTE_ACTIONS) {
    const existing = await permissionQuery.findOne({
      where: { action, role: publicRole.id },
    });
    if (existing) continue;
    await permissionQuery.create({ data: { action, role: publicRole.id } });
    strapi.log.info(`[yggdrasil] Granted public permission for ${action}`);
  }
};

/**
 * Drop expired tokens periodically so the table doesn't bloat. The
 * interval is hardcoded to one hour — frequent enough to keep table
 * size sane, infrequent enough to be invisible to ops.
 */
const startTokenCleanup = (strapi: StrapiInstance): { stop(): void } => {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const tokens = strapi.plugin('yggdrasil').service('tokens') as TokensService;
      const dropped = await tokens.cleanupExpired();
      if (dropped > 0) {
        strapi.log.debug(`[yggdrasil] token cleanup removed ${dropped} expired rows`);
      }
    } catch (err) {
      strapi.log.warn(`[yggdrasil] token cleanup failed: ${(err as Error).message}`);
    }
  };
  const interval = setInterval(tick, TOKEN_CLEANUP_INTERVAL_MS);
  if (typeof interval.unref === 'function') interval.unref();
  // Kick once on boot to clear any backlog accumulated while offline.
  void tick();
  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
  };
};

export default async ({ strapi }: { strapi: StrapiInstance }): Promise<void> => {
  strapi.log.info('[yggdrasil] bootstrap: starting');
  await ensureUpUsersUuidColumn(strapi);
  await runSkinsRegistryMerge(strapi);
  await ensureTextureForeignKeys(strapi);
  await grantPublicPermissions(strapi);
  const crypto = strapi.plugin('yggdrasil').service('crypto') as CryptoService;
  await crypto.init();
  const cleanup = startTokenCleanup(strapi);
  runtimeHandles.set(strapi, { stopTokenCleanup: cleanup.stop });
  strapi.log.info('[yggdrasil] bootstrap: done');
};

/**
 * Release resources owned by the plugin: the token-cleanup interval
 * and the join-sessions backend's internal sweeper. Called from the
 * plugin's `destroy` hook on graceful shutdown / hot reload.
 */
export const teardown = async ({ strapi }: { strapi: StrapiInstance }): Promise<void> => {
  const handles = runtimeHandles.get(strapi);
  if (handles) {
    handles.stopTokenCleanup();
    runtimeHandles.delete(strapi);
  }
  try {
    const sessions = strapi.plugin('yggdrasil').service('join-sessions') as JoinSessionsService;
    sessions.dispose();
  } catch (err) {
    strapi.log.warn(
      `[yggdrasil] teardown: failed to dispose join-sessions backend: ${(err as Error).message}`,
    );
  }
};
