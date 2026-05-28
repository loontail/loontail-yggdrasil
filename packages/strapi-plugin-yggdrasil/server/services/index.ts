import type { CryptoService } from './crypto';
import { createCryptoService } from './crypto';
import { createJoinSessionsService } from './join-sessions';
import { createPasswordsService } from './passwords';
import { createStorageService } from './storage';
import { createTexturesPropertyService } from './textures-property';
import { createTexturesStoreService } from './textures-store';
import { createTokensService } from './tokens';
import { createUsersService } from './users';

type StrapiArg = Parameters<typeof createCryptoService>[0];

export default {
  crypto: createCryptoService,
  tokens: createTokensService,
  users: createUsersService,
  passwords: createPasswordsService,
  'join-sessions': createJoinSessionsService,
  storage: createStorageService,
  'textures-store': createTexturesStoreService,
  'textures-property': ({ strapi }: StrapiArg) => {
    const crypto = strapi.plugin('yggdrasil').service('crypto') as CryptoService;
    return createTexturesPropertyService({ strapi, crypto });
  },
};
