import { readFileSync } from 'node:fs';
import { undashUuid } from '@loontail/yggdrasil-core';
import type { StorageService } from '../services/storage';
import type { AssetKind, TexturesStoreService } from '../services/textures-store';
import type { UsersService } from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';
import { pluginService } from '../utils/strapi-runtime';
import { YggdrasilHttpError } from './helpers';
import {
  MAX_UPLOAD_BYTES,
  parseVariant,
  persistAsset,
  validatePngOrThrow,
} from './textures-helpers';

const HTTP_BAD_REQUEST = 400;
const HTTP_NO_CONTENT = 204;

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

const requireUser = (ctx: KoaContext) => {
  const user = (ctx.state as { yggdrasilUser?: { id: number; uuid: string; username: string } })
    .yggdrasilUser;
  if (!user) {
    throw new YggdrasilHttpError(401, 'ForbiddenOperationException', 'Authentication required.');
  }
  return user;
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
  const existing = await store.findByUserId(kind, owner.id);
  if (existing?.filePath) storage.deleteIfExists(existing.filePath);
  await store.deleteByUserId(kind, owner.id);
  ctx.status = HTTP_NO_CONTENT;
  ctx.body = null;
};

export default ({ strapi }: { strapi: StrapiInstance }) => ({
  // Public read: returns `null` entries for unset assets — never 404s on
  // the lookup itself so admin tooling can probe without a separate check.
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
      store.findByUserId('skin', user.id),
      store.findByUserId('cape', user.id),
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
});
