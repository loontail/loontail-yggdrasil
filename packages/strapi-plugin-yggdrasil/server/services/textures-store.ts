import type { SkinVariant } from '@loontail/yggdrasil-core';
import type { StrapiInstance } from '../types';

const UIDS = {
  skin: 'plugin::yggdrasil.player-skin',
  cape: 'plugin::yggdrasil.player-cape',
} as const;

export type AssetKind = 'skin' | 'cape';

type AssetRowBase = {
  readonly id: number;
  readonly userId: number;
  readonly username: string | null;
  readonly filePath: string;
  readonly fileUrl: string;
  readonly fileSize: number | null;
};

export type SkinRow = AssetRowBase & { readonly variant: SkinVariant };
export type CapeRow = AssetRowBase;
export type AssetRow<K extends AssetKind> = K extends 'skin' ? SkinRow : CapeRow;

type AssetUpsertBase = {
  username?: string;
  filePath: string;
  fileUrl: string;
  fileSize?: number;
};
export type SkinUpsert = AssetUpsertBase & { variant?: SkinVariant };
export type CapeUpsert = AssetUpsertBase;
export type AssetUpsert<K extends AssetKind> = K extends 'skin' ? SkinUpsert : CapeUpsert;

export type ListPage = {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
};

export type ListResult<T> = {
  readonly data: readonly T[];
  readonly total: number;
};

type RawRow = Record<string, unknown>;

const toBase = (raw: RawRow): AssetRowBase => ({
  id: Number(raw.id),
  userId: Number(raw.userId),
  username: raw.username == null ? null : String(raw.username),
  filePath: String(raw.filePath ?? ''),
  fileUrl: String(raw.fileUrl ?? ''),
  fileSize: raw.fileSize == null ? null : Number(raw.fileSize),
});

const toRow = <K extends AssetKind>(
  kind: K,
  raw: RawRow | null | undefined,
): AssetRow<K> | null => {
  if (!raw) return null;
  const base = toBase(raw);
  if (kind === 'skin') {
    const variant = (raw.variant as string)?.toUpperCase() === 'SLIM' ? 'SLIM' : 'CLASSIC';
    return { ...base, variant } as AssetRow<K>;
  }
  return base as AssetRow<K>;
};

const buildWhere = (search?: string): Record<string, unknown> =>
  search ? { $or: [{ username: { $containsi: search } }] } : {};

export type TexturesStoreService = ReturnType<typeof createTexturesStoreService>;

export const createTexturesStoreService = ({ strapi }: { strapi: StrapiInstance }) => {
  const queries = {
    skin: strapi.db.query(UIDS.skin),
    cape: strapi.db.query(UIDS.cape),
  } as const;

  return {
    async findByUserId<K extends AssetKind>(kind: K, userId: number): Promise<AssetRow<K> | null> {
      return toRow(kind, (await queries[kind].findOne({ where: { userId } })) as RawRow | null);
    },

    async findById<K extends AssetKind>(kind: K, id: number): Promise<AssetRow<K> | null> {
      return toRow(kind, (await queries[kind].findOne({ where: { id } })) as RawRow | null);
    },

    async upsert<K extends AssetKind>(
      kind: K,
      userId: number,
      data: AssetUpsert<K>,
    ): Promise<AssetRow<K>> {
      const q = queries[kind];
      const existing = await q.findOne({ where: { userId } });
      const payload: Record<string, unknown> = { userId, ...data };
      if (kind === 'skin') {
        payload.variant = (data as SkinUpsert).variant ?? 'CLASSIC';
      }
      const row = (
        existing
          ? await q.update({ where: { userId }, data: payload })
          : await q.create({ data: payload })
      ) as RawRow;
      const mapped = toRow(kind, row);
      if (!mapped) throw new Error(`upsert(${kind}) returned an unparsable row`);
      return mapped;
    },

    async deleteByUserId(kind: AssetKind, userId: number): Promise<void> {
      const q = queries[kind];
      const existing = await q.findOne({ where: { userId } });
      if (existing) await q.delete({ where: { userId } });
    },

    async deleteById(kind: AssetKind, id: number): Promise<void> {
      await queries[kind].delete({ where: { id } });
    },

    async findMany<K extends AssetKind>(
      kind: K,
      { page = 1, pageSize = 25, search }: ListPage,
    ): Promise<ListResult<AssetRow<K>>> {
      const q = queries[kind];
      const where = buildWhere(search);
      const [data, total] = await Promise.all([
        q.findMany({
          where,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          orderBy: { updatedAt: 'desc' },
        }) as Promise<RawRow[]>,
        q.count({ where }) as Promise<number>,
      ]);
      return {
        data: data.map((r) => toRow(kind, r)).filter((r): r is AssetRow<K> => r !== null),
        total,
      };
    },

    async findMissing(
      exists: (filePath: string) => boolean,
    ): Promise<{ missingSkins: SkinRow[]; missingCapes: CapeRow[] }> {
      const BATCH = 500;
      const scan = async <K extends AssetKind>(kind: K): Promise<AssetRow<K>[]> => {
        const missing: AssetRow<K>[] = [];
        let offset = 0;
        while (true) {
          const rows = (await queries[kind].findMany({
            limit: BATCH,
            offset,
            orderBy: { id: 'asc' },
          })) as RawRow[];
          for (const raw of rows) {
            const row = toRow(kind, raw);
            if (row && !exists(row.filePath)) missing.push(row);
          }
          if (rows.length < BATCH) break;
          offset += BATCH;
        }
        return missing;
      };
      const [missingSkins, missingCapes] = await Promise.all([scan('skin'), scan('cape')]);
      return { missingSkins, missingCapes };
    },
  };
};
