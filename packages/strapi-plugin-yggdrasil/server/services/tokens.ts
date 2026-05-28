import { randomBytes } from 'node:crypto';
import { readConfig } from '../config';
import type { StrapiInstance } from '../types';

const TOKEN_UID = 'plugin::yggdrasil.token';
const TOKEN_TABLE = 'yggdrasil_tokens';
const TOKEN_HEX_BYTES = 32;

const issueOpaqueToken = (): string => randomBytes(TOKEN_HEX_BYTES).toString('hex');

type TokenRow = {
  id: number;
  userId: number;
  accessToken: string;
  clientToken: string;
  issuedAt: string;
  expiresAt: string;
};

const toRow = (raw: Record<string, unknown>): TokenRow => ({
  id: Number(raw.id),
  userId: Number(raw.userId),
  accessToken: String(raw.accessToken),
  clientToken: String(raw.clientToken),
  issuedAt: String(raw.issuedAt),
  expiresAt: String(raw.expiresAt),
});

export type IssuedToken = {
  readonly accessToken: string;
  readonly clientToken: string;
  readonly expiresAt: Date;
};

export type ValidatedToken = {
  readonly id: number;
  readonly userId: number;
  readonly accessToken: string;
  readonly clientToken: string;
};

export type TokensService = ReturnType<typeof createTokensService>;

export const createTokensService = ({ strapi }: { strapi: StrapiInstance }) => {
  const config = () => readConfig(strapi);

  const findActive = async (
    accessToken: string,
    clientToken?: string,
  ): Promise<TokenRow | null> => {
    const where: Record<string, unknown> = { accessToken };
    if (clientToken) where.clientToken = clientToken;
    const raw = (await strapi.db.query(TOKEN_UID).findOne({ where })) as Record<
      string,
      unknown
    > | null;
    if (!raw) return null;
    const row = toRow(raw);
    if (Date.parse(row.expiresAt) <= Date.now()) {
      await strapi.db.query(TOKEN_UID).delete({ where: { id: row.id } });
      return null;
    }
    return row;
  };

  const enforceCap = async (userId: number): Promise<void> => {
    const cfg = config();
    const all = (await strapi.db.query(TOKEN_UID).findMany({
      where: { userId },
      orderBy: { issuedAt: 'asc' },
    })) as Record<string, unknown>[];
    const excess = all.length + 1 - cfg.tokens.maxPerUser;
    if (excess <= 0) return;
    const victims = all.slice(0, excess);
    for (const victim of victims) {
      await strapi.db.query(TOKEN_UID).delete({ where: { id: Number(victim.id) } });
    }
  };

  return {
    async issue(userId: number, clientToken?: string): Promise<IssuedToken> {
      const cfg = config();
      await enforceCap(userId);
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + cfg.tokens.accessTtlSeconds * 1000);
      const accessToken = issueOpaqueToken();
      const finalClientToken =
        clientToken && clientToken.length > 0 ? clientToken : issueOpaqueToken();
      await strapi.db.query(TOKEN_UID).create({
        data: {
          userId,
          accessToken,
          clientToken: finalClientToken,
          issuedAt,
          expiresAt,
        },
      });
      return { accessToken, clientToken: finalClientToken, expiresAt };
    },

    async validate(accessToken: string, clientToken?: string): Promise<ValidatedToken | null> {
      const row = await findActive(accessToken, clientToken);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        accessToken: row.accessToken,
        clientToken: row.clientToken,
      };
    },

    async refresh(accessToken: string, clientToken?: string): Promise<IssuedToken | null> {
      const existing = await findActive(accessToken, clientToken);
      if (!existing) return null;
      await strapi.db.query(TOKEN_UID).delete({ where: { id: existing.id } });
      return this.issue(existing.userId, existing.clientToken);
    },

    async invalidate(accessToken: string, clientToken?: string): Promise<void> {
      const where: Record<string, unknown> = { accessToken };
      if (clientToken) where.clientToken = clientToken;
      await strapi.db.query(TOKEN_UID).delete({ where });
    },

    async cleanupExpired(): Promise<number> {
      const knex = strapi.db.connection;
      // SQLite's Knex DELETE doesn't support .returning() — resolves to a count number.
      const result = (await knex(TOKEN_TABLE).where('expires_at', '<=', knex.fn.now()).delete()) as
        | number
        | Record<string, unknown>[];
      return Array.isArray(result) ? result.length : result;
    },
  };
};
