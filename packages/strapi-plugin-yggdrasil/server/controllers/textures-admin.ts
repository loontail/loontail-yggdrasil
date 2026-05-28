import type { StorageService } from '../services/storage';
import type { AssetKind, TexturesStoreService } from '../services/textures-store';
import type { UsersService, YggdrasilUserRow } from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';
import { buildPaginationMeta, parseListQuery } from '../utils/http';
import { pluginService } from '../utils/strapi-runtime';
import { YggdrasilHttpError } from './helpers';
import {
  MAX_UPLOAD_BYTES,
  parseVariant,
  persistAsset,
  validatePngOrThrow,
} from './textures-helpers';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

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
  const row = await store.findById(kind, id);
  if (!row) {
    ctx.status = HTTP_NOT_FOUND;
    return;
  }
  if (row.filePath) storage.deleteIfExists(row.filePath);
  await store.deleteById(kind, id);
  ctx.body = { success: true };
};

export default ({ strapi }: { strapi: StrapiInstance }) => ({
  async listSkins(ctx: KoaContext): Promise<void> {
    const opts = parseListQuery(ctx);
    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const { data, total } = await store.findMany('skin', opts);
    ctx.body = { data, meta: buildPaginationMeta(total, opts.page, opts.pageSize) };
  },

  async listCapes(ctx: KoaContext): Promise<void> {
    const opts = parseListQuery(ctx);
    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const { data, total } = await store.findMany('cape', opts);
    ctx.body = { data, meta: buildPaginationMeta(total, opts.page, opts.pageSize) };
  },

  uploadSkin: (ctx: KoaContext) => adminBase64Upload(strapi, 'skin', ctx),
  uploadCape: (ctx: KoaContext) => adminBase64Upload(strapi, 'cape', ctx),
  deleteSkin: (ctx: KoaContext) => adminDeleteRow(strapi, 'skin', ctx),
  deleteCape: (ctx: KoaContext) => adminDeleteRow(strapi, 'cape', ctx),

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
      ...missingSkins.map((s) => store.deleteById('skin', s.id)),
      ...missingCapes.map((c) => store.deleteById('cape', c.id)),
    ]);
    ctx.body = { deletedSkins: missingSkins.length, deletedCapes: missingCapes.length };
  },
});
