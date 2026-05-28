import {
  type SkinVariant,
  SkinVariants,
  assertPngBuffer,
  isYggdrasilCoreError,
} from '@loontail/yggdrasil-core';
import type { StorageService } from '../services/storage';
import type { AssetKind, CapeRow, SkinRow, TexturesStoreService } from '../services/textures-store';
import type { StrapiInstance } from '../types';
import { pluginService } from '../utils/strapi-runtime';
import { YggdrasilHttpError } from './helpers';

const HTTP_BAD_REQUEST = 400;

// 256 KB caps the biggest legitimate Minecraft HD skin (128×128 ~20 KB);
// rejects multi-MB uploads early.
export const MAX_UPLOAD_BYTES = 256 * 1024;

export const parseVariant = (raw: unknown): SkinVariant => {
  if (typeof raw === 'string' && raw.toUpperCase() === SkinVariants.SLIM) return SkinVariants.SLIM;
  return SkinVariants.CLASSIC;
};

export const validatePngOrThrow = (buffer: Buffer, kind: AssetKind): void => {
  try {
    assertPngBuffer(buffer, kind);
  } catch (err) {
    if (isYggdrasilCoreError(err)) {
      throw new YggdrasilHttpError(HTTP_BAD_REQUEST, 'IllegalArgumentException', err.message);
    }
    throw err;
  }
};

export const persistAsset = async (
  strapi: StrapiInstance,
  kind: AssetKind,
  owner: { id: number; uuid: string; username: string },
  buffer: Buffer,
  variant?: SkinVariant,
): Promise<SkinRow | CapeRow> => {
  const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
  const storage = pluginService<StorageService>(strapi, 'storage');

  const previous = await store.findByUserId(kind, owner.id);

  const filename = storage.buildFilename(owner.uuid);
  storage.write(kind, filename, buffer);
  const filePath = storage.diskPath(kind, filename);
  const fileUrl = storage.publicUrl(kind, filename);

  const row =
    kind === 'skin'
      ? await store.upsert('skin', owner.id, {
          username: owner.username,
          filePath,
          fileUrl,
          fileSize: buffer.length,
          variant: variant ?? SkinVariants.CLASSIC,
        })
      : await store.upsert('cape', owner.id, {
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
