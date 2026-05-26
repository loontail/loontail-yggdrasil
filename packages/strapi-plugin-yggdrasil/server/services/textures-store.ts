import type { SkinVariant } from '@loontail/yggdrasil-core';
import type { StrapiInstance } from '../types';

const SKIN_UID = 'plugin::yggdrasil.player-skin';
const CAPE_UID = 'plugin::yggdrasil.player-cape';

export type SkinRow = {
  readonly id: number;
  readonly userId: number;
  readonly username: string | null;
  readonly filePath: string;
  readonly fileUrl: string;
  readonly fileSize: number | null;
  readonly variant: SkinVariant;
};

export type CapeRow = {
  readonly id: number;
  readonly userId: number;
  readonly username: string | null;
  readonly filePath: string;
  readonly fileUrl: string;
  readonly fileSize: number | null;
};

type CommonUpsert = {
  username?: string;
  filePath: string;
  fileUrl: string;
  fileSize?: number;
};

type SkinUpsert = CommonUpsert & { variant?: SkinVariant };
type CapeUpsert = CommonUpsert;

type RawRow = Record<string, unknown>;

const toSkin = (raw: RawRow | null | undefined): SkinRow | null => {
  if (!raw) return null;
  const variant = (raw.variant as string)?.toUpperCase() === 'SLIM' ? 'SLIM' : 'CLASSIC';
  return {
    id: Number(raw.id),
    userId: Number(raw.userId),
    username: raw.username == null ? null : String(raw.username),
    filePath: String(raw.filePath ?? ''),
    fileUrl: String(raw.fileUrl ?? ''),
    fileSize: raw.fileSize == null ? null : Number(raw.fileSize),
    variant,
  };
};

const toCape = (raw: RawRow | null | undefined): CapeRow | null => {
  if (!raw) return null;
  return {
    id: Number(raw.id),
    userId: Number(raw.userId),
    username: raw.username == null ? null : String(raw.username),
    filePath: String(raw.filePath ?? ''),
    fileUrl: String(raw.fileUrl ?? ''),
    fileSize: raw.fileSize == null ? null : Number(raw.fileSize),
  };
};

export type ListPage = {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
};

export type ListResult<T> = {
  readonly data: readonly T[];
  readonly total: number;
};

const buildWhere = (search?: string): Record<string, unknown> =>
  search ? { $or: [{ username: { $containsi: search } }] } : {};

export type TexturesStoreService = ReturnType<typeof createTexturesStoreService>;

export const createTexturesStoreService = ({ strapi }: { strapi: StrapiInstance }) => {
  const skin = strapi.db.query(SKIN_UID);
  const cape = strapi.db.query(CAPE_UID);

  const findOneSkin = async (where: Record<string, unknown>): Promise<SkinRow | null> =>
    toSkin((await skin.findOne({ where })) as RawRow | null);

  const findOneCape = async (where: Record<string, unknown>): Promise<CapeRow | null> =>
    toCape((await cape.findOne({ where })) as RawRow | null);

  return {
    findSkinByUserId: (userId: number) => findOneSkin({ userId }),
    findCapeByUserId: (userId: number) => findOneCape({ userId }),
    findSkinById: (id: number) => findOneSkin({ id }),
    findCapeById: (id: number) => findOneCape({ id }),

    async upsertSkin(userId: number, data: SkinUpsert): Promise<SkinRow> {
      const existing = await skin.findOne({ where: { userId } });
      const payload = {
        userId,
        username: data.username,
        filePath: data.filePath,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        variant: data.variant ?? 'CLASSIC',
      };
      const row = existing
        ? ((await skin.update({ where: { userId }, data: payload })) as RawRow)
        : ((await skin.create({ data: payload })) as RawRow);
      const mapped = toSkin(row);
      if (!mapped) throw new Error('upsertSkin returned an unparsable row');
      return mapped;
    },

    async upsertCape(userId: number, data: CapeUpsert): Promise<CapeRow> {
      const existing = await cape.findOne({ where: { userId } });
      const payload = {
        userId,
        username: data.username,
        filePath: data.filePath,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
      };
      const row = existing
        ? ((await cape.update({ where: { userId }, data: payload })) as RawRow)
        : ((await cape.create({ data: payload })) as RawRow);
      const mapped = toCape(row);
      if (!mapped) throw new Error('upsertCape returned an unparsable row');
      return mapped;
    },

    async deleteSkinByUserId(userId: number): Promise<void> {
      const existing = await skin.findOne({ where: { userId } });
      if (existing) await skin.delete({ where: { userId } });
    },

    async deleteCapeByUserId(userId: number): Promise<void> {
      const existing = await cape.findOne({ where: { userId } });
      if (existing) await cape.delete({ where: { userId } });
    },

    async deleteSkinById(id: number): Promise<void> {
      await skin.delete({ where: { id } });
    },

    async deleteCapeById(id: number): Promise<void> {
      await cape.delete({ where: { id } });
    },

    async findManySkins({
      page = 1,
      pageSize = 25,
      search,
    }: ListPage): Promise<ListResult<SkinRow>> {
      const where = buildWhere(search);
      const [data, total] = await Promise.all([
        skin.findMany({
          where,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          orderBy: { updatedAt: 'desc' },
        }) as Promise<RawRow[]>,
        skin.count({ where }) as Promise<number>,
      ]);
      return {
        data: data.map((r) => toSkin(r) as SkinRow).filter((r): r is SkinRow => Boolean(r)),
        total,
      };
    },

    async findManyCapes({
      page = 1,
      pageSize = 25,
      search,
    }: ListPage): Promise<ListResult<CapeRow>> {
      const where = buildWhere(search);
      const [data, total] = await Promise.all([
        cape.findMany({
          where,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          orderBy: { updatedAt: 'desc' },
        }) as Promise<RawRow[]>,
        cape.count({ where }) as Promise<number>,
      ]);
      return {
        data: data.map((r) => toCape(r) as CapeRow).filter((r): r is CapeRow => Boolean(r)),
        total,
      };
    },

    /**
     * Walk both tables in fixed-size batches and report rows whose
     * `filePath` is no longer on disk. Iterating without pagination
     * would be a memory hazard once the user base grows.
     */
    async findMissing(
      exists: (filePath: string) => boolean,
    ): Promise<{ missingSkins: SkinRow[]; missingCapes: CapeRow[] }> {
      const BATCH = 500;
      const collectMissing = async <T>(
        scan: (offset: number) => Promise<T[]>,
        diskPathOf: (row: T) => string,
      ): Promise<T[]> => {
        const missing: T[] = [];
        let offset = 0;
        while (true) {
          const batch = await scan(offset);
          for (const row of batch) {
            if (!exists(diskPathOf(row))) missing.push(row);
          }
          if (batch.length < BATCH) break;
          offset += BATCH;
        }
        return missing;
      };

      const [missingSkins, missingCapes] = await Promise.all([
        collectMissing<SkinRow>(
          async (offset) => {
            const rows = (await skin.findMany({
              limit: BATCH,
              offset,
              orderBy: { id: 'asc' },
            })) as RawRow[];
            return rows.map((r) => toSkin(r) as SkinRow).filter((r): r is SkinRow => Boolean(r));
          },
          (r) => r.filePath,
        ),
        collectMissing<CapeRow>(
          async (offset) => {
            const rows = (await cape.findMany({
              limit: BATCH,
              offset,
              orderBy: { id: 'asc' },
            })) as RawRow[];
            return rows.map((r) => toCape(r) as CapeRow).filter((r): r is CapeRow => Boolean(r));
          },
          (r) => r.filePath,
        ),
      ]);
      return { missingSkins, missingCapes };
    },
  };
};
