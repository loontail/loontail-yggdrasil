import type { StrapiInstance } from '../types';

export const pluginService = <T>(strapi: StrapiInstance, name: string): T =>
  strapi.plugin('yggdrasil').service(name) as T;
