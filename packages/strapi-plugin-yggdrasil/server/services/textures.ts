import {
  type GameProfileProperty,
  SkinVariants,
  buildTexturesPayload,
  encodeTexturesPayloadBase64,
} from '@loontail/yggdrasil-core';
import { readConfig } from '../config';
import type { StrapiInstance } from '../types';
import type { CryptoService } from './crypto';
import type { TexturesStoreService } from './textures-store';
import type { YggdrasilUserRow } from './users';

const TEXTURES_PROPERTY_NAME = 'textures';

const isHttpUrl = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://');

/**
 * Build the absolute URL we hand back to clients. Constructed from the
 * configured `publicUrl`'s origin + the relative path the textures-store
 * persisted. This guarantees the host matches an entry in `skinDomains`.
 */
const toPublicUrl = (strapi: StrapiInstance, relUrl: string): string => {
  if (isHttpUrl(relUrl)) return relUrl;
  const cfg = readConfig(strapi);
  const origin = new URL(cfg.publicUrl).origin;
  return `${origin}${relUrl.startsWith('/') ? relUrl : `/${relUrl}`}`;
};

const pluginService = <T>(strapi: StrapiInstance, name: string): T =>
  strapi.plugin('yggdrasil').service(name) as T;

export type TexturesService = ReturnType<typeof createTexturesService>;

export type BuildOptions = {
  /** When false, the property is returned without `signature`. */
  readonly signed?: boolean;
};

export const createTexturesService = ({
  strapi,
  crypto,
}: {
  strapi: StrapiInstance;
  crypto: CryptoService;
}) => ({
  /**
   * Build the `textures` profile property for `user`. Returns `null`
   * when the user has neither a skin nor a cape (so the caller can
   * omit `properties` entirely).
   */
  async buildTexturesProperty(
    user: YggdrasilUserRow,
    options: BuildOptions = {},
  ): Promise<GameProfileProperty | null> {
    if (!user.uuid) return null;

    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const [skinRow, capeRow] = await Promise.all([
      store.findSkinByUserId(user.id),
      store.findCapeByUserId(user.id),
    ]);
    if (!skinRow && !capeRow) return null;

    const skin = skinRow
      ? {
          url: toPublicUrl(strapi, skinRow.fileUrl),
          variant: skinRow.variant ?? SkinVariants.CLASSIC,
        }
      : undefined;
    const cape = capeRow ? { url: toPublicUrl(strapi, capeRow.fileUrl) } : undefined;

    const payload = buildTexturesPayload({
      profileId: user.uuid,
      profileName: user.username,
      ...(skin ? { skin } : {}),
      ...(cape ? { cape } : {}),
    });
    const value = encodeTexturesPayloadBase64(payload);
    const property: GameProfileProperty = {
      name: TEXTURES_PROPERTY_NAME,
      value,
      ...(options.signed === false ? {} : { signature: crypto.signBase64(value) }),
    };
    return property;
  },
});
