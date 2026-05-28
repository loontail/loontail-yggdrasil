import type { YggdrasilMeta } from '@loontail/yggdrasil-core';
import { readConfig } from '../config';
import type { CryptoService } from '../services/crypto';
import type { KoaContext, StrapiInstance } from '../types';
import { pluginService } from './helpers';

export default ({ strapi }: { strapi: StrapiInstance }) => ({
  async meta(ctx: KoaContext) {
    const cfg = readConfig(strapi);
    const crypto = pluginService<CryptoService>(strapi, 'crypto');
    const all = crypto.allPublicKeyPems();
    const meta: YggdrasilMeta = {
      meta: {
        serverName: cfg.serverName,
        implementationName: cfg.implementationName,
        implementationVersion: cfg.implementationVersion,
      },
      skinDomains: [...cfg.skinDomains],
      signaturePublickey: crypto.publicKeyPem(),
      ...(all.length > 1 ? { signaturePublickeys: all } : {}),
    };
    ctx.body = meta;
  },
});
