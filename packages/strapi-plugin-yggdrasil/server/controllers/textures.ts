import { readFileSync } from 'node:fs';
import {
  type SkinVariant,
  SkinVariants,
  assertPngBuffer,
  isYggdrasilCoreError,
  undashUuid,
} from '@loontail/yggdrasil-core';
import type { StorageKind, StorageService } from '../services/storage';
import type { CapeRow, SkinRow, TexturesStoreService } from '../services/textures-store';
import type { UsersService, YggdrasilUserRow } from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';
import { YggdrasilHttpError, pluginService } from './helpers';

const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;
const HTTP_NO_CONTENT = 204;

/**
 * Hard cap for skin/cape uploads. Real Minecraft skins are 64×64 (~5
 * KB); the largest legitimate HD pack is 128×128 (~20 KB). 256 KB is a
 * generous ceiling that still blocks an accidental or malicious
 * multi-MB PNG from filling the disk.
 */
const MAX_UPLOAD_BYTES = 256 * 1024;

type AssetKind = StorageKind;

type FormidableFile = {
  readonly filepath: string;
  readonly mimetype: string | null;
  readonly size: number;
};

const getFormidableFile = (files: unknown, fieldName: string): FormidableFile | null => {
  const bag = files as Record<string, FormidableFile | FormidableFile[]> | undefined;
  if (!bag) return null;
  const entry = bag[fieldName];
  if (!entry) return null;
  return Array.isArray(entry) ? (entry[0] ?? null) : entry;
};

const parseVariant = (raw: unknown): SkinVariant => {
  if (typeof raw === 'string' && raw.toUpperCase() === SkinVariants.SLIM) return SkinVariants.SLIM;
  return SkinVariants.CLASSIC;
};

const requireUser = (ctx: KoaContext) => {
  const user = (ctx.state as { yggdrasilUser?: { id: number; uuid: string; username: string } })
    .yggdrasilUser;
  if (!user) {
    throw new YggdrasilHttpError(401, 'ForbiddenOperationException', 'Authentication required.');
  }
  return user;
};

const validatePngOrThrow = (buffer: Buffer, kind: AssetKind): void => {
  try {
    assertPngBuffer(buffer, kind);
  } catch (err) {
    if (isYggdrasilCoreError(err)) {
      throw new YggdrasilHttpError(HTTP_BAD_REQUEST, 'IllegalArgumentException', err.message);
    }
    throw err;
  }
};

const persistAsset = async (
  strapi: StrapiInstance,
  kind: AssetKind,
  owner: { id: number; uuid: string; username: string },
  buffer: Buffer,
  variant?: SkinVariant,
): Promise<SkinRow | CapeRow> => {
  const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
  const storage = pluginService<StorageService>(strapi, 'storage');

  const previous =
    kind === 'skin'
      ? await store.findSkinByUserId(owner.id)
      : await store.findCapeByUserId(owner.id);

  const filename = storage.buildFilename(owner.uuid);
  storage.write(kind, filename, buffer);
  const filePath = storage.diskPath(kind, filename);
  const fileUrl = storage.publicUrl(kind, filename);

  const row =
    kind === 'skin'
      ? await store.upsertSkin(owner.id, {
          username: owner.username,
          filePath,
          fileUrl,
          fileSize: buffer.length,
          variant: variant ?? SkinVariants.CLASSIC,
        })
      : await store.upsertCape(owner.id, {
          username: owner.username,
          filePath,
          fileUrl,
          fileSize: buffer.length,
        });

  if (previous?.filePath && previous.filePath !== filePath) {
    storage.deleteIfExists(previous.filePath);
  }

  return row;
};

const handleSelfUpload = async (
  strapi: StrapiInstance,
  kind: AssetKind,
  ctx: KoaContext,
): Promise<void> => {
  const owner = requireUser(ctx);
  const file = getFormidableFile((ctx.request as { files?: unknown }).files, 'file');
  if (!file) {
    throw new YggdrasilHttpError(HTTP_BAD_REQUEST, 'IllegalArgumentException', 'No file uploaded.');
  }
  if (file.mimetype !== 'image/png') {
    throw new YggdrasilHttpError(
      HTTP_BAD_REQUEST,
      'IllegalArgumentException',
      'File must be a PNG.',
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new YggdrasilHttpError(
      HTTP_BAD_REQUEST,
      'IllegalArgumentException',
      `File exceeds maximum size of ${MAX_UPLOAD_BYTES} bytes.`,
    );
  }
  const buffer = readFileSync(file.filepath);
  validatePngOrThrow(buffer, kind);
  const variant =
    kind === 'skin'
      ? parseVariant((ctx.request.body as Record<string, unknown>)?.variant)
      : undefined;
  await persistAsset(strapi, kind, owner, buffer, variant);
  ctx.status = HTTP_NO_CONTENT;
  ctx.body = null;
};

const handleSelfDelete = async (
  strapi: StrapiInstance,
  kind: AssetKind,
  ctx: KoaContext,
): Promise<void> => {
  const owner = requireUser(ctx);
  const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
  const storage = pluginService<StorageService>(strapi, 'storage');
  const existing =
    kind === 'skin'
      ? await store.findSkinByUserId(owner.id)
      : await store.findCapeByUserId(owner.id);
  if (existing?.filePath) storage.deleteIfExists(existing.filePath);
  if (kind === 'skin') {
    await store.deleteSkinByUserId(owner.id);
  } else {
    await store.deleteCapeByUserId(owner.id);
  }
  ctx.status = HTTP_NO_CONTENT;
  ctx.body = null;
};

const adminBase64Upload = async (
  strapi: StrapiInstance,
  kind: AssetKind,
  ctx: KoaContext,
): Promise<void> => {
  const body = (ctx.request.body as Record<string, unknown>) ?? {};
  const userId = Number(body.userId);
  if (!userId) {
    throw new YggdrasilHttpError(HTTP_BAD_REQUEST, 'IllegalArgumentException', 'userId required.');
  }
  const fileBase64 = body.fileBase64 as string | undefined;
  if (!fileBase64) {
    throw new YggdrasilHttpError(
      HTTP_BAD_REQUEST,
      'IllegalArgumentException',
      'fileBase64 required.',
    );
  }
  const buffer = Buffer.from(fileBase64, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new YggdrasilHttpError(
      HTTP_BAD_REQUEST,
      'IllegalArgumentException',
      `File exceeds maximum size of ${MAX_UPLOAD_BYTES} bytes.`,
    );
  }
  validatePngOrThrow(buffer, kind);
  const users = pluginService<UsersService>(strapi, 'users');
  const user: YggdrasilUserRow | null = await users.findById(userId);
  if (!user || !user.uuid) {
    throw new YggdrasilHttpError(
      HTTP_NOT_FOUND,
      'IllegalArgumentException',
      'User has no Yggdrasil UUID yet (must log in once).',
    );
  }
  const variant = kind === 'skin' ? parseVariant(body.variant) : undefined;
  const username = (body.username as string) || user.username;
  ctx.body = await persistAsset(
    strapi,
    kind,
    { id: user.id, uuid: user.uuid, username },
    buffer,
    variant,
  );
};

const adminDeleteRow = async (
  strapi: StrapiInstance,
  kind: AssetKind,
  ctx: KoaContext,
): Promise<void> => {
  const id = Number(ctx.params.id);
  if (!id) {
    throw new YggdrasilHttpError(HTTP_BAD_REQUEST, 'IllegalArgumentException', 'id required.');
  }
  const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
  const storage = pluginService<StorageService>(strapi, 'storage');
  const row = kind === 'skin' ? await store.findSkinById(id) : await store.findCapeById(id);
  if (!row) {
    ctx.status = HTTP_NOT_FOUND;
    return;
  }
  if (row.filePath) storage.deleteIfExists(row.filePath);
  if (kind === 'skin') {
    await store.deleteSkinById(id);
  } else {
    await store.deleteCapeById(id);
  }
  ctx.body = { success: true };
};

const buildPaginationMeta = (total: number, page: number, pageSize: number) => ({
  pagination: {
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
    total,
  },
});

const parseListQuery = (ctx: KoaContext) => ({
  page: Number(ctx.query.page) || 1,
  pageSize: Number(ctx.query.pageSize) || 25,
  search: typeof ctx.query.search === 'string' ? ctx.query.search : undefined,
});

export default ({ strapi }: { strapi: StrapiInstance }) => ({
  /**
   * Public read by Yggdrasil UUID. Returns `null` entries for the
   * assets the player hasn't uploaded — never 404 on the lookup
   * itself, so admin tooling can use this endpoint without an extra
   * existence check.
   */
  async getTextures(ctx: KoaContext): Promise<void> {
    const undashed = undashUuid(String(ctx.params.uuid ?? ''));
    const users = pluginService<UsersService>(strapi, 'users');
    const user = await users.findByUuid(undashed);
    if (!user) {
      ctx.body = { skin: null, cape: null };
      return;
    }
    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const [skin, cape] = await Promise.all([
      store.findSkinByUserId(user.id),
      store.findCapeByUserId(user.id),
    ]);
    ctx.body = {
      skin: skin ? { url: skin.fileUrl, variant: skin.variant } : null,
      cape: cape ? { url: cape.fileUrl } : null,
    };
  },

  uploadSkin: (ctx: KoaContext) => handleSelfUpload(strapi, 'skin', ctx),
  uploadCape: (ctx: KoaContext) => handleSelfUpload(strapi, 'cape', ctx),
  deleteSkin: (ctx: KoaContext) => handleSelfDelete(strapi, 'skin', ctx),
  deleteCape: (ctx: KoaContext) => handleSelfDelete(strapi, 'cape', ctx),

  async listSkins(ctx: KoaContext): Promise<void> {
    const opts = parseListQuery(ctx);
    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const { data, total } = await store.findManySkins(opts);
    ctx.body = { data, meta: buildPaginationMeta(total, opts.page, opts.pageSize) };
  },

  async listCapes(ctx: KoaContext): Promise<void> {
    const opts = parseListQuery(ctx);
    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const { data, total } = await store.findManyCapes(opts);
    ctx.body = { data, meta: buildPaginationMeta(total, opts.page, opts.pageSize) };
  },

  adminUploadSkin: (ctx: KoaContext) => adminBase64Upload(strapi, 'skin', ctx),
  adminUploadCape: (ctx: KoaContext) => adminBase64Upload(strapi, 'cape', ctx),
  adminDeleteSkin: (ctx: KoaContext) => adminDeleteRow(strapi, 'skin', ctx),
  adminDeleteCape: (ctx: KoaContext) => adminDeleteRow(strapi, 'cape', ctx),

  async validate(ctx: KoaContext): Promise<void> {
    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const storage = pluginService<StorageService>(strapi, 'storage');
    const { missingSkins, missingCapes } = await store.findMissing((p) => storage.exists(p));
    ctx.body = {
      missingSkins: missingSkins.map((s) => s.id),
      missingCapes: missingCapes.map((c) => c.id),
    };
  },

  async purgeMissing(ctx: KoaContext): Promise<void> {
    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const storage = pluginService<StorageService>(strapi, 'storage');
    const { missingSkins, missingCapes } = await store.findMissing((p) => storage.exists(p));
    await Promise.all([
      ...missingSkins.map((s) => store.deleteSkinById(s.id)),
      ...missingCapes.map((c) => store.deleteCapeById(c.id)),
    ]);
    ctx.body = { deletedSkins: missingSkins.length, deletedCapes: missingCapes.length };
  },
});
