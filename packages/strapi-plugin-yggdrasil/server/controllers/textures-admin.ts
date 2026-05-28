import { YggdrasilErrorKinds } from '@loontail/yggdrasil-core';
import { z } from 'zod';
import type { StorageService } from '../services/storage';
import type { AssetKind, TexturesStoreService } from '../services/textures-store';
import {
  type UsersService,
  type YggdrasilUserRow,
  isYggdrasilUserEligible,
} from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';
import { buildPaginationMeta, parseListQuery } from '../utils/http';
import { pluginService } from '../utils/strapi-runtime';
import { YggdrasilHttpError, parseOrThrow } from './helpers';
import {
  MAX_UPLOAD_BYTES,
  parseVariant,
  persistAsset,
  validatePngOrThrow,
} from './textures-helpers';

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_UPLOAD_BASE64_CHARS = Math.ceil((MAX_UPLOAD_BYTES / 3) * 4) + 4;

const OptionalNonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
  z.string().optional(),
);

const AdminBase64UploadSchema = z.object({
  userId: z.coerce.number().int().positive(),
  fileBase64: z
    .string()
    .min(1)
    .max(MAX_UPLOAD_BASE64_CHARS, 'fileBase64 exceeds the maximum upload size')
    .regex(BASE64_RE, 'fileBase64 must be valid base64'),
  username: OptionalNonEmptyStringSchema,
  variant: z.unknown().optional(),
});

const adminBase64Upload = async (
  strapi: StrapiInstance,
  kind: AssetKind,
  ctx: KoaContext,
): Promise<void> => {
  const body = parseOrThrow(ctx, AdminBase64UploadSchema, ctx.request.body);
  const buffer = Buffer.from(body.fileBase64, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new YggdrasilHttpError(
      HTTP_BAD_REQUEST,
      YggdrasilErrorKinds.IllegalArgument,
      `File exceeds maximum size of ${MAX_UPLOAD_BYTES} bytes.`,
    );
  }
  validatePngOrThrow(buffer, kind);
  const users = pluginService<UsersService>(strapi, 'users');
  const user: YggdrasilUserRow | null = await users.findById(body.userId);
  if (!user || !user.uuid) {
    throw new YggdrasilHttpError(
      HTTP_NOT_FOUND,
      YggdrasilErrorKinds.IllegalArgument,
      'User has no Yggdrasil UUID yet (must log in once).',
    );
  }
  if (!isYggdrasilUserEligible(user)) {
    throw new YggdrasilHttpError(
      HTTP_FORBIDDEN,
      YggdrasilErrorKinds.Forbidden,
      'User is blocked or not confirmed.',
    );
  }
  const variant = kind === 'skin' ? parseVariant(body.variant) : undefined;
  const username = body.username ?? user.username;
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
    throw new YggdrasilHttpError(
      HTTP_BAD_REQUEST,
      YggdrasilErrorKinds.IllegalArgument,
      'id required.',
    );
  }
  const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
  const storage = pluginService<StorageService>(strapi, 'storage');
  const row = await store.findById(kind, id);
  if (!row) {
    ctx.status = HTTP_NOT_FOUND;
    return;
  }
  if (row.filePath) {
    try {
      storage.deleteIfExists(row.filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      strapi.log.warn(`[yggdrasil] could not delete ${kind} file for row ${id}: ${message}`);
    }
  }
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
