import { randomUndashedUuid } from '@loontail/yggdrasil-core';
import type { StrapiInstance } from '../types';

/**
 * Domain shape for an `up_users` row as the Yggdrasil plugin sees it.
 * Strapi's content-manager isn't aware of the `uuid` column (we add it
 * at bootstrap via raw Knex), so we read it via the same low-level API.
 *
 * Skin/cape URLs used to live on this row as denormalised strings
 * (`up_users.skin`, `up_users.cape`). They have moved into the plugin's
 * own `yggdrasil_player_skins` / `_capes` tables — owned by the
 * `textures-store` service — and the legacy columns are dropped during
 * bootstrap. Don't add them back.
 */
export type YggdrasilUserRow = {
  readonly id: number;
  readonly username: string;
  readonly uuid: string | null;
  readonly blocked: boolean | null;
  readonly confirmed: boolean | null;
};

const TABLE = 'up_users';
const COLUMNS = ['id', 'username', 'uuid', 'blocked', 'confirmed'] as const;

type Strapi = StrapiInstance;

const knex = (strapi: Strapi) => strapi.db.connection;

const toRow = (raw: Record<string, unknown> | undefined | null): YggdrasilUserRow | null => {
  if (!raw) return null;
  return {
    id: Number(raw.id),
    username: String(raw.username ?? ''),
    uuid: raw.uuid == null ? null : String(raw.uuid),
    blocked: raw.blocked == null ? null : Boolean(raw.blocked),
    confirmed: raw.confirmed == null ? null : Boolean(raw.confirmed),
  };
};

export type UsersService = ReturnType<typeof createUsersService>;

export const createUsersService = ({ strapi }: { strapi: Strapi }) => ({
  /**
   * Look up by UUID case-insensitively. New UUIDs are lowercased by
   * {@link randomUndashedUuid}, but legacy or hand-seeded rows may not
   * be, and callers always normalise the input to lowercase anyway.
   */
  async findByUuid(uuid: string): Promise<YggdrasilUserRow | null> {
    const row = (await knex(strapi)(TABLE)
      .whereRaw('LOWER(uuid) = ?', [uuid.toLowerCase()])
      .first(...COLUMNS)) as Record<string, unknown> | undefined;
    return toRow(row);
  },

  async findById(id: number): Promise<YggdrasilUserRow | null> {
    const row = (await knex(strapi)(TABLE)
      .where({ id })
      .first(...COLUMNS)) as Record<string, unknown> | undefined;
    return toRow(row);
  },

  /**
   * Resolve a `username` _or_ email to a single row. Matches Strapi's
   * users-permissions behaviour where `/api/auth/local` accepts an
   * `identifier` that can be either.
   */
  async findByIdentifier(identifier: string): Promise<YggdrasilUserRow | null> {
    const lower = identifier.toLowerCase();
    const row = (await knex(strapi)(TABLE)
      .whereRaw('LOWER(email) = ? OR LOWER(username) = ?', [lower, lower])
      .first(...COLUMNS)) as Record<string, unknown> | undefined;
    return toRow(row);
  },

  /**
   * Same as `findByIdentifier` but also returns the password hash so
   * the auth service can run u-p's `validatePassword`. Kept separate
   * to avoid leaking the hash through the regular accessors — and to
   * keep `findByIdentifier`'s SELECT minimal.
   */
  async findByIdentifierWithPassword(
    identifier: string,
  ): Promise<(YggdrasilUserRow & { password: string }) | null> {
    const lower = identifier.toLowerCase();
    const row = (await knex(strapi)(TABLE)
      .whereRaw('LOWER(email) = ? OR LOWER(username) = ?', [lower, lower])
      .first(...COLUMNS, 'password')) as Record<string, unknown> | undefined;
    if (!row) return null;
    const baseRow = toRow(row);
    if (!baseRow) return null;
    return { ...baseRow, password: String(row.password ?? '') };
  },

  /**
   * Atomically assign a fresh UUID if the user does not yet have one.
   * Returns the row's UUID (existing or newly-issued) in lowercase so
   * callers can compare without worrying about case. Wins one `UPDATE`
   * in case of concurrent first-logins from the same account.
   */
  async ensureUuid(userId: number): Promise<string> {
    const existing = await this.findById(userId);
    if (!existing) {
      throw new Error(`up_users row ${userId} not found`);
    }
    if (existing.uuid) return existing.uuid.toLowerCase();

    const fresh = randomUndashedUuid();
    const result = (await knex(strapi)(TABLE)
      .where({ id: userId })
      .whereNull('uuid')
      .update({ uuid: fresh })
      .returning('uuid')) as Record<string, unknown>[];
    if (result.length > 0 && result[0]?.uuid) {
      return String(result[0].uuid).toLowerCase();
    }
    // Someone else won the race; re-read.
    const after = await this.findById(userId);
    if (!after?.uuid) {
      throw new Error(`Failed to assign uuid to up_users row ${userId}`);
    }
    return after.uuid.toLowerCase();
  },
});
