import { ensureTextureForeignKeys } from './bootstrap-steps/ensure-texture-foreign-keys';
import { ensureUsersUuidColumn } from './bootstrap-steps/ensure-users-uuid-column';
import { grantPublicPermissions } from './bootstrap-steps/grant-public-permissions';
import { type TokenCleanupHandle, startTokenCleanup } from './bootstrap-steps/token-cleanup';
import { runSkinsRegistryMerge } from './migrations/skins-registry-merge';
import type { CryptoService } from './services/crypto';
import type { JoinSessionsService } from './services/join-sessions';
import type { StorageService } from './services/storage';
import type { StrapiInstance } from './types';

const runtimeHandles = new WeakMap<StrapiInstance, TokenCleanupHandle>();

export default async ({ strapi }: { strapi: StrapiInstance }): Promise<void> => {
  strapi.log.info('[yggdrasil] bootstrap: starting');
  await ensureUsersUuidColumn(strapi);
  await runSkinsRegistryMerge(strapi);
  await ensureTextureForeignKeys(strapi);
  await grantPublicPermissions(strapi);
  await (strapi.plugin('yggdrasil').service('crypto') as CryptoService).init();
  (strapi.plugin('yggdrasil').service('storage') as StorageService).init();
  runtimeHandles.set(strapi, startTokenCleanup(strapi));
  strapi.log.info('[yggdrasil] bootstrap: done');
};

export const teardown = async ({ strapi }: { strapi: StrapiInstance }): Promise<void> => {
  runtimeHandles.get(strapi)?.stop();
  runtimeHandles.delete(strapi);
  try {
    const sessions = strapi.plugin('yggdrasil').service('join-sessions') as JoinSessionsService;
    sessions.dispose();
  } catch (err) {
    strapi.log.warn(
      `[yggdrasil] teardown: failed to dispose join-sessions backend: ${(err as Error).message}`,
    );
  }
};
