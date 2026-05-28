export type { YggdrasilClientOptions } from './client.js';
export { YggdrasilClient } from './client.js';

export {
  AUTHLIB_INJECTOR_VENDOR_DIR_ENV,
  AUTHLIB_INJECTOR_VERSION,
  buildAuthlibInjectorJvmArg,
  resolveAuthlibInjectorJarPath,
} from './authlib-injector.js';

export type {
  YggdrasilClientErrorCode,
  YggdrasilClientErrorContext,
  YggdrasilClientErrorOptions,
} from './errors/yggdrasil-client-error.js';
export {
  YggdrasilClientError,
  YggdrasilClientErrorCodes,
  isYggdrasilClientError,
  isYggdrasilClientErrorCode,
} from './errors/yggdrasil-client-error.js';

export type {
  AccessToken,
  ClientToken,
  GameProfile,
  GameProfileProperty,
  PlayerUuid,
  ServerId,
  SkinVariant,
  TexturesLookupResponse,
  TexturesPayload,
  YggdrasilMeta,
  YggdrasilSession,
  YggdrasilUser,
} from '@loontail/yggdrasil-core';
export {
  decodeTexturesPayloadBase64,
  SkinVariants,
  TextureKinds,
} from '@loontail/yggdrasil-core';
