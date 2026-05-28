import { randomUndashedUuid } from '@loontail/yggdrasil-core';
import type { StrapiInstance } from '../types';

export type YggdrasilUserRow = {
  readonly id: number;
  readonly username: string;
  readonly uuid: string | null;
  readonly blocked: boolean | null;
  readonly confirmed: boolean | null;
};

export const isYggdrasilUserEligible = <T extends Pick<YggdrasilUserRow, 'blocked' | 'confirmed'>>(
  user: T | null,
): user is T => Boolean(user && !user.blocked && user.confirmed !== false);

const TABLE = 'up_users';
const COLUMNS = ['id', 'username', 'uuid', 'blocked', 'confirmed'] as const;

const knex = (strapi: StrapiInstance) => strapi.db.connection;

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

export const createUsersService = ({ strapi }: { strapi: StrapiInstance }) => ({
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

  async findByIdentifier(identifier: string): Promise<YggdrasilUserRow | null> {
    const lower = identifier.toLowerCase();
    const row = (await knex(strapi)(TABLE)
      .whereRaw('LOWER(email) = ? OR LOWER(username) = ?', [lower, lower])
      .first(...COLUMNS)) as Record<string, unknown> | undefined;
    return toRow(row);
  },

  async findByUsername(username: string): Promise<YggdrasilUserRow | null> {
    const row = (await knex(strapi)(TABLE)
      .whereRaw('LOWER(username) = ?', [username.toLowerCase()])
      .first(...COLUMNS)) as Record<string, unknown> | undefined;
    return toRow(row);
  },

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

  async ensureUuid(userId: number): Promise<string> {
    const existing = await this.findById(userId);
    if (!existing) {
      throw new Error(`up_users row ${userId} not found`);
    }
    if (existing.uuid) return existing.uuid.toLowerCase();

    const fresh = randomUndashedUuid();
    await knex(strapi)(TABLE).where({ id: userId }).whereNull('uuid').update({ uuid: fresh });
    const after = await this.findById(userId);
    if (!after?.uuid) {
      throw new Error(`Failed to assign uuid to up_users row ${userId}`);
    }
    return after.uuid.toLowerCase();
  },
});
