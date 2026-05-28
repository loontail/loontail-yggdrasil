import {
  type GameProfileProperty,
  SkinVariants,
  buildTexturesPayload,
  encodeTexturesPayloadBase64,
} from '@loontail/yggdrasil-core';
import { readConfig } from '../config';
import type { StrapiInstance } from '../types';
import { pluginService } from '../utils/strapi-runtime';
import type { CryptoService } from './crypto';
import type { TexturesStoreService } from './textures-store';
import type { YggdrasilUserRow } from './users';

const TEXTURES_PROPERTY_NAME = 'textures';

const isHttpUrl = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://');

const toPublicUrl = (strapi: StrapiInstance, relUrl: string): string => {
  if (isHttpUrl(relUrl)) return relUrl;
  const origin = new URL(readConfig(strapi).publicUrl).origin;
  return `${origin}${relUrl.startsWith('/') ? relUrl : `/${relUrl}`}`;
};

export type TexturesPropertyService = ReturnType<typeof createTexturesPropertyService>;

export type BuildOptions = {
  readonly signed?: boolean;
};

export const createTexturesPropertyService = ({
  strapi,
  crypto,
}: {
  strapi: StrapiInstance;
  crypto: CryptoService;
}) => ({
  async build(
    user: YggdrasilUserRow,
    options: BuildOptions = {},
  ): Promise<GameProfileProperty | null> {
    if (!user.uuid) return null;

    const store = pluginService<TexturesStoreService>(strapi, 'textures-store');
    const [skinRow, capeRow] = await Promise.all([
      store.findByUserId('skin', user.id),
      store.findByUserId('cape', user.id),
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
    return {
      name: TEXTURES_PROPERTY_NAME,
      value,
      ...(options.signed === false ? {} : { signature: crypto.signBase64(value) }),
    };
  },
});
