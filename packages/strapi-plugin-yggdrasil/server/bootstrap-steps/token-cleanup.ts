import type { TokensService } from '../services/tokens';
import type { StrapiInstance } from '../types';

const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export type TokenCleanupHandle = {
  stop(): void;
};

export const startTokenCleanup = (strapi: StrapiInstance): TokenCleanupHandle => {
  let stopped = false;
  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const tokens = strapi.plugin('yggdrasil').service('tokens') as TokensService;
      const dropped = await tokens.cleanupExpired();
      if (dropped > 0) {
        strapi.log.debug(`[yggdrasil] token cleanup removed ${dropped} expired rows`);
      }
    } catch (err) {
      strapi.log.warn(`[yggdrasil] token cleanup failed: ${(err as Error).message}`);
    }
  };
  const interval = setInterval(tick, TOKEN_CLEANUP_INTERVAL_MS);
  if (typeof interval.unref === 'function') interval.unref();
  void tick();
  return {
    stop() {
      stopped = true;
      clearInterval(interval);
    },
  };
};
