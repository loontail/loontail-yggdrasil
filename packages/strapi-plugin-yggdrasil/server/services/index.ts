import { createCryptoService } from './crypto';
import { createJoinSessionsService } from './join-sessions';
import { createPasswordsService } from './passwords';
import { createStorageService } from './storage';
import { createTexturesService } from './textures';
import { createTexturesStoreService } from './textures-store';
import { createTokensService } from './tokens';
import { createUsersService } from './users';

export default {
  crypto: createCryptoService,
  tokens: createTokensService,
  users: createUsersService,
  passwords: createPasswordsService,
  'join-sessions': createJoinSessionsService,
  storage: createStorageService,
  'textures-store': createTexturesStoreService,
  textures: ({ strapi }: { strapi: unknown }) => {
    // The textures service composes the crypto service. We resolve it
    // lazily via `strapi.plugin('yggdrasil').service('crypto')` so the
    // service factory order does not matter.
    const s = strapi as Parameters<typeof createCryptoService>[0]['strapi'];
    const crypto = s.plugin('yggdrasil').service('crypto') as ReturnType<
      typeof createCryptoService
    >;
    return createTexturesService({ strapi: s, crypto });
  },
};
