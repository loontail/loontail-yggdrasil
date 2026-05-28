import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { detectSkinVariant } from '@loontail/minecraft-kit';
import { randomUndashedUuid } from '@loontail/yggdrasil-core';
import type { StorageService } from '../services/storage';
import type { StrapiInstance } from '../types';

const MARKER_TABLE = 'yggdrasil_migrations';
const MARKER_KEY = 'skins-registry-merge';

const OLD_SKIN_TABLE = 'skins_registry_player_skins';
const OLD_CAPE_TABLE = 'skins_registry_player_capes';
const NEW_SKIN_TABLE = 'yggdrasil_player_skins';
const NEW_CAPE_TABLE = 'yggdrasil_player_capes';

const OLD_PUBLIC_DIR = 'public/skins-registry';

type Knex = StrapiInstance['db']['connection'];

type LegacyRow = {
  id: number;
  userId: number;
  username: string | null;
  filePath: string;
  fileUrl: string;
  fileSize: number | null;
};

type RawLegacyRow = Record<string, unknown>;

const ensureMarkerTable = async (knex: Knex): Promise<void> => {
  if (await knex.schema.hasTable(MARKER_TABLE)) return;
  await knex.schema.createTable(MARKER_TABLE, (table) => {
    table.string('key', 64).primary();
    table.timestamp('appliedAt').notNullable();
  });
};

const markerExists = async (knex: Knex): Promise<boolean> => {
  if (!(await knex.schema.hasTable(MARKER_TABLE))) return false;
  const row = await knex(MARKER_TABLE).where({ key: MARKER_KEY }).first('key');
  return Boolean(row);
};

const insertMarker = async (knex: Knex): Promise<void> => {
  await knex(MARKER_TABLE).insert({ key: MARKER_KEY, appliedAt: new Date() });
};

const toLegacyRow = (raw: RawLegacyRow): LegacyRow => ({
  id: Number(raw.id),
  userId: Number(raw.userId ?? raw.user_id),
  username: raw.username == null ? null : String(raw.username),
  filePath: String(raw.filePath ?? raw.file_path ?? ''),
  fileUrl: String(raw.fileUrl ?? raw.file_url ?? ''),
  fileSize:
    raw.fileSize == null && raw.file_size == null ? null : Number(raw.fileSize ?? raw.file_size),
});

const readLegacy = async (knex: Knex, table: string): Promise<LegacyRow[]> => {
  if (!(await knex.schema.hasTable(table))) return [];
  const rows = (await knex(table).select('*')) as unknown as RawLegacyRow[];
  return rows.map(toLegacyRow);
};

const ensureUserUuid = async (
  knex: Knex,
  userId: number,
  uuidCache: Map<number, string>,
): Promise<string | null> => {
  const cached = uuidCache.get(userId);
  if (cached) return cached;
  const row = (await knex('up_users').where({ id: userId }).first('id', 'uuid')) as
    | { id: number; uuid: string | null }
    | undefined;
  if (!row) return null;
  if (row.uuid) {
    uuidCache.set(userId, row.uuid.toLowerCase());
    return row.uuid.toLowerCase();
  }
  const fresh = randomUndashedUuid();
  await knex('up_users').where({ id: userId }).update({ uuid: fresh });
  uuidCache.set(userId, fresh);
  return fresh;
};

const detectVariantSafely = (diskPath: string): 'CLASSIC' | 'SLIM' => {
  try {
    if (!existsSync(diskPath)) return 'CLASSIC';
    const buf = readFileSync(diskPath);
    const detected = detectSkinVariant(buf);
    return detected.toUpperCase() === 'SLIM' ? 'SLIM' : 'CLASSIC';
  } catch {
    // Legacy rows can point at deleted files; default to CLASSIC and let copy planning skip missing sources.
    return 'CLASSIC';
  }
};

type CopyPlan = {
  kind: 'skin' | 'cape';
  legacy: LegacyRow;
  uuid: string;
  newFilename: string;
  newFilePath: string;
  newFileUrl: string;
  variant: 'CLASSIC' | 'SLIM' | null;
};

const planCopies = async (
  strapi: StrapiInstance,
  storage: StorageService,
  knex: Knex,
  legacySkins: LegacyRow[],
  legacyCapes: LegacyRow[],
): Promise<CopyPlan[]> => {
  const cache = new Map<number, string>();
  const plans: CopyPlan[] = [];

  for (const row of legacySkins) {
    const uuid = await ensureUserUuid(knex, row.userId, cache);
    if (!uuid) {
      strapi.log.warn(
        `[yggdrasil] migration: skipping skin row ${row.id} — up_users.${row.userId} missing`,
      );
      continue;
    }
    const newFilename = storage.buildFilename(uuid);
    plans.push({
      kind: 'skin',
      legacy: row,
      uuid,
      newFilename,
      newFilePath: storage.diskPath('skin', newFilename),
      newFileUrl: storage.publicUrl('skin', newFilename),
      variant: detectVariantSafely(legacyDiskPath(strapi, row.filePath)),
    });
  }
  for (const row of legacyCapes) {
    const uuid = await ensureUserUuid(knex, row.userId, cache);
    if (!uuid) {
      strapi.log.warn(
        `[yggdrasil] migration: skipping cape row ${row.id} — up_users.${row.userId} missing`,
      );
      continue;
    }
    const newFilename = storage.buildFilename(uuid);
    plans.push({
      kind: 'cape',
      legacy: row,
      uuid,
      newFilename,
      newFilePath: storage.diskPath('cape', newFilename),
      newFileUrl: storage.publicUrl('cape', newFilename),
      variant: null,
    });
  }
  return plans;
};

const legacyDiskPath = (strapi: StrapiInstance, storedFilePath: string): string => {
  if (storedFilePath && existsSync(storedFilePath)) return storedFilePath;
  return resolve(strapi.dirs.app.root, storedFilePath);
};

const copyFiles = (strapi: StrapiInstance, plans: CopyPlan[]): CopyPlan[] => {
  const copied: CopyPlan[] = [];
  for (const plan of plans) {
    const source = legacyDiskPath(strapi, plan.legacy.filePath);
    if (!existsSync(plan.newFilePath)) {
      if (!existsSync(source)) {
        strapi.log.warn(
          `[yggdrasil] migration: source PNG missing for ${plan.kind} row ${plan.legacy.id} (${source})`,
        );
        continue;
      }
      mkdirSync(dirname(plan.newFilePath), { recursive: true });
      copyFileSync(source, plan.newFilePath);
    }
    copied.push(plan);
  }
  return copied;
};

const insertNewRows = async (knex: Knex, plans: CopyPlan[]): Promise<void> => {
  for (const plan of plans) {
    const target = plan.kind === 'skin' ? NEW_SKIN_TABLE : NEW_CAPE_TABLE;
    if (!(await knex.schema.hasTable(target))) continue;
    const existing = await knex(target).where({ userId: plan.legacy.userId }).first('id');
    const payload: Record<string, unknown> = {
      userId: plan.legacy.userId,
      username: plan.legacy.username,
      filePath: plan.newFilePath,
      fileUrl: plan.newFileUrl,
      fileSize: plan.legacy.fileSize,
    };
    if (plan.kind === 'skin') payload.variant = plan.variant ?? 'CLASSIC';
    if (existing) {
      await knex(target).where({ userId: plan.legacy.userId }).update(payload);
    } else {
      await knex(target).insert(payload);
    }
  }
};

const dropLegacyTables = async (knex: Knex): Promise<void> => {
  await knex.schema.dropTableIfExists(OLD_SKIN_TABLE);
  await knex.schema.dropTableIfExists(OLD_CAPE_TABLE);
};

const dropUpUsersColumns = async (knex: Knex, strapi: StrapiInstance): Promise<void> => {
  if (await knex.schema.hasColumn('up_users', 'skin')) {
    strapi.log.info('[yggdrasil] migration: dropping up_users.skin column');
    await knex.schema.alterTable('up_users', (table) => {
      table.dropColumn('skin');
    });
  }
  if (await knex.schema.hasColumn('up_users', 'cape')) {
    strapi.log.info('[yggdrasil] migration: dropping up_users.cape column');
    await knex.schema.alterTable('up_users', (table) => {
      table.dropColumn('cape');
    });
  }
};

const cleanLegacyDir = (strapi: StrapiInstance): void => {
  const dir = join(strapi.dirs.app.root, OLD_PUBLIC_DIR);
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
    strapi.log.info(`[yggdrasil] migration: removed legacy ${OLD_PUBLIC_DIR}/`);
  } catch (err) {
    strapi.log.warn(
      `[yggdrasil] migration: could not remove legacy ${OLD_PUBLIC_DIR}/: ${
        (err as Error).message
      }`,
    );
  }
};

const hasAnyLegacyData = async (knex: Knex, strapi: StrapiInstance): Promise<boolean> => {
  const skinsExist = await knex.schema.hasTable(OLD_SKIN_TABLE);
  const capesExist = await knex.schema.hasTable(OLD_CAPE_TABLE);
  const dirExists = existsSync(join(strapi.dirs.app.root, OLD_PUBLIC_DIR));
  return skinsExist || capesExist || dirExists;
};

export const runSkinsRegistryMerge = async (strapi: StrapiInstance): Promise<void> => {
  const knex = strapi.db.connection;
  await ensureMarkerTable(knex);
  if (await markerExists(knex)) {
    strapi.log.debug('[yggdrasil] migration: skins-registry-merge already applied');
    return;
  }
  if (!(await hasAnyLegacyData(knex, strapi))) {
    strapi.log.info('[yggdrasil] migration: no legacy skins-registry data — recording marker');
    await insertMarker(knex);
    return;
  }
  strapi.log.info('[yggdrasil] migration: skins-registry-merge starting');

  const storage = strapi.plugin('yggdrasil').service('storage') as StorageService;
  const legacySkins = await readLegacy(knex, OLD_SKIN_TABLE);
  const legacyCapes = await readLegacy(knex, OLD_CAPE_TABLE);
  strapi.log.info(
    `[yggdrasil] migration: discovered ${legacySkins.length} skin rows, ${legacyCapes.length} cape rows`,
  );

  const plans = await planCopies(strapi, storage, knex, legacySkins, legacyCapes);

  const copiedPlans = copyFiles(strapi, plans);

  await knex.transaction(async (trx) => {
    await insertNewRows(trx, copiedPlans);
    await dropLegacyTables(trx);
    await dropUpUsersColumns(trx, strapi);
    await trx(MARKER_TABLE).insert({ key: MARKER_KEY, appliedAt: new Date() });
  });

  cleanLegacyDir(strapi);

  strapi.log.info('[yggdrasil] migration: skins-registry-merge done');
};
