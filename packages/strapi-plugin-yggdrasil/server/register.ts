import type { StrapiInstance } from './types';

export default async ({ strapi }: { strapi: StrapiInstance }): Promise<void> => {
  const existing = (strapi.config.get('middlewares', []) as unknown[]) ?? [];
  const middlewareId = 'plugin::yggdrasil.error-shape';
  if (Array.isArray(existing) && !existing.includes(middlewareId)) {
    (strapi.config as { set?: (k: string, v: unknown) => void }).set?.('middlewares', [
      ...existing,
      middlewareId,
    ]);
  }
};
