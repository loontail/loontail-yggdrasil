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
