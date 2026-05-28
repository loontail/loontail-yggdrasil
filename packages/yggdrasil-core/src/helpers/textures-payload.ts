import { YggdrasilCoreError, YggdrasilCoreErrorCodes } from '../errors/yggdrasil-core-error.js';
import {
  type SkinVariant,
  SkinVariants,
  type TextureCapeEntry,
  type TextureSkinEntry,
  type TexturesPayload,
} from '../types/textures.js';
import { isUuidUndashed } from './uuid.js';

export type BuildTexturesPayloadInput = {
  readonly profileId: string;
  readonly profileName: string;
  readonly skin?: {
    readonly url: string;
    readonly variant: SkinVariant;
  };
  readonly cape?: {
    readonly url: string;
  };
  readonly timestamp?: number;
};

export const buildTexturesPayload = (input: BuildTexturesPayloadInput): TexturesPayload => {
  if (!isUuidUndashed(input.profileId)) {
    throw new YggdrasilCoreError(
      YggdrasilCoreErrorCodes.INVALID_TEXTURES_INPUT,
      'profileId must be a 32-character undashed hex UUID',
      { context: { profileId: input.profileId } },
    );
  }
  if (!input.profileName) {
    throw new YggdrasilCoreError(
      YggdrasilCoreErrorCodes.INVALID_TEXTURES_INPUT,
      'profileName must be non-empty',
    );
  }

  const skin: TextureSkinEntry | undefined = input.skin
    ? input.skin.variant === SkinVariants.SLIM
      ? { url: input.skin.url, metadata: { model: 'slim' } }
      : { url: input.skin.url }
    : undefined;
  const cape: TextureCapeEntry | undefined = input.cape ? { url: input.cape.url } : undefined;

  return {
    timestamp: input.timestamp ?? Date.now(),
    profileId: input.profileId.toLowerCase(),
    profileName: input.profileName,
    textures: {
      ...(skin ? { SKIN: skin } : {}),
      ...(cape ? { CAPE: cape } : {}),
    },
  };
};

export const encodeTexturesPayloadBase64 = (payload: TexturesPayload): string => {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== 'undefined') return Buffer.from(json, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
};

export const decodeTexturesPayloadBase64 = (encoded: string): TexturesPayload => {
  let json: string;
  try {
    if (typeof Buffer !== 'undefined') {
      json = Buffer.from(encoded, 'base64').toString('utf8');
    } else {
      const binary = globalThis.atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    }
  } catch (err) {
    throw new YggdrasilCoreError(
      YggdrasilCoreErrorCodes.INVALID_TEXTURES_INPUT,
      'textures payload is not valid base64',
      { cause: err },
    );
  }
  try {
    return JSON.parse(json) as TexturesPayload;
  } catch (err) {
    throw new YggdrasilCoreError(
      YggdrasilCoreErrorCodes.INVALID_TEXTURES_INPUT,
      'textures payload is not valid JSON',
      { cause: err },
    );
  }
};
