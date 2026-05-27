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
  /** Profile UUID, 32 hex chars, undashed. */
  readonly profileId: string;
  /** In-game name to embed in the payload. */
  readonly profileName: string;
  readonly skin?: {
    readonly url: string;
    readonly variant: SkinVariant;
  };
  readonly cape?: {
    readonly url: string;
  };
  /** Milliseconds since epoch. Defaults to `Date.now()`. */
  readonly timestamp?: number;
};

/**
 * Build the unencoded `texturesPayload` JSON object that lives inside
 * the `value` field of a `textures` profile property (after base64
 * encoding). The server is expected to RSA-sign the base64 bytes
 * separately and put the result in `signature`.
 *
 * @example
 * ```ts
 * const payload = buildTexturesPayload({
 *   profileId: '11111111111111111111111111111111',
 *   profileName: 'Steve',
 *   skin: { url: 'https://example.com/skin.png', variant: 'SLIM' },
 * });
 * const value = Buffer.from(JSON.stringify(payload)).toString('base64');
 * ```
 */
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

/**
 * Convenience helper: serialize a {@link TexturesPayload} to the
 * base64 string that goes into `properties[0].value`.
 *
 * Uses `Buffer` when available (Node) and falls back to a manual
 * UTF-8 → base64 path for environments without it.
 */
export const encodeTexturesPayloadBase64 = (payload: TexturesPayload): string => {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== 'undefined') return Buffer.from(json, 'utf8').toString('base64');
  // Browser path: encode UTF-8 then base64.
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
};

/**
 * Reverse of {@link encodeTexturesPayloadBase64}. Decodes the
 * `properties[0].value` base64 string back into the JSON
 * {@link TexturesPayload}. Throws {@link YggdrasilCoreError} with
 * `invalid_textures_input` on a malformed input.
 *
 * @example
 * ```ts
 * const profile = await client.profile(uuid, { signed: true });
 * const prop = profile.properties?.find((p) => p.name === 'textures');
 * if (prop) {
 *   const payload = decodeTexturesPayloadBase64(prop.value);
 *   console.log(payload.textures.SKIN?.url);
 *   console.log(payload.textures.SKIN?.metadata?.model); // 'slim' | undefined
 * }
 * ```
 */
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
