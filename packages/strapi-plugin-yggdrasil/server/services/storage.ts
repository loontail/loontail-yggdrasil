import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StrapiInstance } from '../types';

const BASE_RELATIVE = join('public', 'yggdrasil', 'textures');
const SKINS_DIR = 'skins';
const CAPES_DIR = 'capes';
const REVISION_BYTES = 6;

const newRevision = (): string => randomBytes(REVISION_BYTES).toString('hex');

export type StorageKind = 'skin' | 'cape';

const subdir = (kind: StorageKind): string => (kind === 'skin' ? SKINS_DIR : CAPES_DIR);

export type StorageService = ReturnType<typeof createStorageService>;

export const createStorageService = ({ strapi }: { strapi: StrapiInstance }) => {
  const basePath = (): string => resolve(strapi.dirs.app.root, BASE_RELATIVE);
  const kindPath = (kind: StorageKind): string => join(basePath(), subdir(kind));

  return {
    init(): void {
      mkdirSync(kindPath('skin'), { recursive: true });
      mkdirSync(kindPath('cape'), { recursive: true });
    },

    diskPath(kind: StorageKind, filename: string): string {
      return join(kindPath(kind), filename);
    },

    publicUrl(kind: StorageKind, filename: string): string {
      return `/yggdrasil/textures/${subdir(kind)}/${filename}`;
    },

    // Each upload gets a fresh revision so the public URL changes too —
    // HTTP caches (Chromium, any reverse proxy) cannot serve stale bytes.
    buildFilename(uuid: string): string {
      return `${uuid}-${newRevision()}.png`;
    },

    write(kind: StorageKind, filename: string, buffer: Buffer): void {
      const target = this.diskPath(kind, filename);
      const temp = `${target}.${newRevision()}.tmp`;
      try {
        writeFileSync(temp, buffer);
        renameSync(temp, target);
      } catch (err) {
        if (existsSync(temp)) rmSync(temp, { force: true });
        throw err;
      }
    },

    deleteIfExists(filePath: string): void {
      if (filePath && existsSync(filePath)) rmSync(filePath);
    },

    exists(filePath: string): boolean {
      return existsSync(filePath);
    },
  };
};
