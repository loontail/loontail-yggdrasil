import { readConfig } from '../config';
import type { StrapiInstance } from '../types';

const TTL_MS = 30 * 1000;
const SWEEP_INTERVAL_MS = 5 * 1000;

export type JoinEntry = {
  readonly userId: number;
  readonly ip?: string;
};

type StoredEntry = JoinEntry & { expiresAt: number };

type Backend = {
  put(serverId: string, entry: JoinEntry): Promise<void>;
  take(serverId: string): Promise<JoinEntry | null>;
  size(): Promise<number>;
  dispose(): void;
};

const memoryBackend = (): Backend => {
  const store = new Map<string, StoredEntry>();
  const sweep = (): void => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  };
  const interval = setInterval(sweep, SWEEP_INTERVAL_MS);
  if (typeof interval.unref === 'function') interval.unref();
  return {
    async put(serverId, entry) {
      store.set(serverId, { ...entry, expiresAt: Date.now() + TTL_MS });
    },
    async take(serverId) {
      const entry = store.get(serverId);
      if (!entry) return null;
      store.delete(serverId);
      if (entry.expiresAt <= Date.now()) return null;
      const { expiresAt: _expiresAt, ...rest } = entry;
      return rest;
    },
    async size() {
      sweep();
      return store.size;
    },
    dispose() {
      clearInterval(interval);
      store.clear();
    },
  };
};

const dbBackend = (strapi: StrapiInstance): Backend => {
  strapi.log.warn(
    '[yggdrasil] joinBackend="db" is not yet implemented; falling back to memory backend',
  );
  return memoryBackend();
};

export type JoinSessionsService = ReturnType<typeof createJoinSessionsService>;

export const createJoinSessionsService = ({ strapi }: { strapi: StrapiInstance }) => {
  const cfg = readConfig(strapi);
  const backend = cfg.joinBackend === 'db' ? dbBackend(strapi) : memoryBackend();

  return {
    async put(serverId: string, entry: JoinEntry): Promise<void> {
      await backend.put(serverId, entry);
    },
    async take(serverId: string): Promise<JoinEntry | null> {
      return backend.take(serverId);
    },
    async size(): Promise<number> {
      return backend.size();
    },
    dispose(): void {
      backend.dispose();
    },
  };
};
