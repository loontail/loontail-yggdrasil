import {
  type SkinVariant,
  SkinVariants,
  YggdrasilErrorKinds,
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
      throw new YggdrasilHttpError(
        HTTP_BAD_REQUEST,
        YggdrasilErrorKinds.IllegalArgument,
        err.message,
      );
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

  let row: SkinRow | CapeRow;
  try {
    row =
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
  } catch (err) {
    try {
      storage.deleteIfExists(filePath);
    } catch (cleanupErr) {
      const message = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      strapi.log.warn(`[yggdrasil] could not clean up failed ${kind} upload: ${message}`);
    }
    throw err;
  }

  if (previous?.filePath && previous.filePath !== filePath) {
    try {
      storage.deleteIfExists(previous.filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      strapi.log.warn(`[yggdrasil] could not delete previous ${kind} file: ${message}`);
    }
  }

  return row;
};
