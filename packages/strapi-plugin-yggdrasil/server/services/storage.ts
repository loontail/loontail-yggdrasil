import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StrapiInstance } from '../types';

const BASE_RELATIVE = join('public', 'yggdrasil', 'textures');
const SKINS_DIR = 'skins';
const CAPES_DIR = 'capes';

/**
 * Each upload writes to a new filename so the public URL changes too —
 * an HTTP cache layer (Chromium in the launcher, any reverse proxy
 * fronting Strapi) sees a brand-new resource and cannot serve stale
 * bytes for a freshly-uploaded skin. The previous filename is captured
 * before the upsert and removed by the controller after the row points
 * at the new file.
 */
const REVISION_BYTES = 6;
const newRevision = (): string => randomBytes(REVISION_BYTES).toString('hex');

export type StorageKind = 'skin' | 'cape';

const subdir = (kind: StorageKind): string => (kind === 'skin' ? SKINS_DIR : CAPES_DIR);

export type StorageService = ReturnType<typeof createStorageService>;

export const createStorageService = ({ strapi }: { strapi: StrapiInstance }) => {
  const basePath = (): string => resolve(strapi.dirs.app.root, BASE_RELATIVE);
  const kindPath = (kind: StorageKind): string => join(basePath(), subdir(kind));

  const ensureDirs = (): void => {
    mkdirSync(kindPath('skin'), { recursive: true });
    mkdirSync(kindPath('cape'), { recursive: true });
  };

  return {
    /** Absolute path under `public/yggdrasil/textures/` for `filename`. */
    diskPath(kind: StorageKind, filename: string): string {
      return join(kindPath(kind), filename);
    },

    /**
     * Public URL fragment — the consumer Strapi app serves `public/*`
     * via `strapi::public`, so the URL is the path with the `public/`
     * prefix stripped.
     */
    publicUrl(kind: StorageKind, filename: string): string {
      return `/yggdrasil/textures/${subdir(kind)}/${filename}`;
    },

    /**
     * Build a new filename for `uuid`. UUIDs (not internal Strapi ids)
     * appear in the filename so the public URL maps cleanly to the
     * identity exposed by the Yggdrasil protocol.
     */
    buildFilename(uuid: string): string {
      return `${uuid}-${newRevision()}.png`;
    },

    /** Write a buffer to disk, creating directories if missing. */
    write(kind: StorageKind, filename: string, buffer: Buffer): void {
      ensureDirs();
      writeFileSync(this.diskPath(kind, filename), buffer);
    },

    /** Best-effort delete. Silently ignores already-gone files. */
    deleteIfExists(filePath: string): void {
      if (filePath && existsSync(filePath)) rmSync(filePath);
    },

    /** Test for file presence — used by `validate` admin scan. */
    exists(filePath: string): boolean {
      return existsSync(filePath);
    },
  };
};
