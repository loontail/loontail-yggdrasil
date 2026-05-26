import { YggdrasilCoreError, YggdrasilCoreErrorCodes } from '../errors/yggdrasil-core-error.js';

/**
 * Byte-level PNG validation for Minecraft skin/cape uploads.
 *
 * A tolerant `Content-Type` is not enough — clients routinely send
 * `image/png` regardless of what the buffer actually contains. Both the
 * upload server (e.g. `skins-registry`) and the launcher should run this
 * check so a malformed file fails early with an actionable message
 * instead of breaking downstream image decoding.
 *
 * PNG layout (RFC 2083):
 * ```
 *   bytes 0..7   = signature `89 50 4E 47 0D 0A 1A 0A`
 *   bytes 8..11  = first chunk length (must be 13 for IHDR)
 *   bytes 12..15 = chunk type "IHDR"
 *   bytes 16..19 = width  (big-endian uint32)
 *   bytes 20..23 = height (big-endian uint32)
 * ```
 */

/** PNG file magic per RFC 2083 §3.1. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
/** Smallest prefix we need to read both the signature and IHDR width/height. */
const PNG_HEADER_MIN_BYTES = 24;
const IHDR_TYPE_OFFSET = 12;
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;

/**
 * Minecraft accepts both modern square skins and legacy short skins.
 * @see https://minecraft.wiki/w/Skin
 */
export const SKIN_VALID_DIMENSIONS = ['64x64', '64x32'] as const;
/** Capes are always 64×32; the visible region is 22×17. */
export const CAPE_VALID_DIMENSIONS = ['64x32'] as const;

export const SkinAssetKinds = {
  SKIN: 'skin',
  CAPE: 'cape',
} as const;

export type SkinAssetKind = (typeof SkinAssetKinds)[keyof typeof SkinAssetKinds];

export type PngValidationResult =
  | { readonly ok: true; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly reason: string };

const matchesSignature = (view: Uint8Array): boolean => {
  if (view.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (view[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
};

const readUInt32BE = (view: Uint8Array, offset: number): number =>
  (((view[offset] ?? 0) << 24) |
    ((view[offset + 1] ?? 0) << 16) |
    ((view[offset + 2] ?? 0) << 8) |
    (view[offset + 3] ?? 0)) >>>
  0;

const allowedDimensionsFor = (kind: SkinAssetKind): readonly string[] =>
  kind === SkinAssetKinds.SKIN ? SKIN_VALID_DIMENSIONS : CAPE_VALID_DIMENSIONS;

const toUint8 = (buffer: ArrayBuffer | Uint8Array): Uint8Array =>
  buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

/**
 * Validate a PNG buffer against Minecraft skin/cape constraints. Returns
 * a discriminated `PngValidationResult` so callers can render a localised
 * error without a try/catch. Use {@link assertPngBuffer} if you prefer
 * the throwing variant.
 */
export const validatePngBuffer = (
  buffer: ArrayBuffer | Uint8Array,
  kind: SkinAssetKind,
): PngValidationResult => {
  const view = toUint8(buffer);
  if (view.length < PNG_HEADER_MIN_BYTES) {
    return {
      ok: false,
      reason: `file too small to be a PNG (need at least ${PNG_HEADER_MIN_BYTES} bytes)`,
    };
  }
  if (!matchesSignature(view)) {
    const head = Array.from(view.subarray(0, PNG_SIGNATURE.length))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return { ok: false, reason: `file is not a PNG (header ${head})` };
  }
  const ihdrType = String.fromCharCode(
    view[IHDR_TYPE_OFFSET] ?? 0,
    view[IHDR_TYPE_OFFSET + 1] ?? 0,
    view[IHDR_TYPE_OFFSET + 2] ?? 0,
    view[IHDR_TYPE_OFFSET + 3] ?? 0,
  );
  if (ihdrType !== 'IHDR') {
    return { ok: false, reason: `first PNG chunk is "${ihdrType}", expected "IHDR"` };
  }
  const width = readUInt32BE(view, IHDR_WIDTH_OFFSET);
  const height = readUInt32BE(view, IHDR_HEIGHT_OFFSET);
  const allowed = allowedDimensionsFor(kind);
  if (!allowed.includes(`${width}x${height}`)) {
    return {
      ok: false,
      reason: `${kind} dimensions ${width}x${height} are not supported (expected ${allowed.join(' or ')})`,
    };
  }
  return { ok: true, width, height };
};

/**
 * Throwing variant of {@link validatePngBuffer}. Returns the decoded
 * dimensions on success, throws {@link YggdrasilCoreError} with code
 * `invalid_png` on any validation failure.
 */
export const assertPngBuffer = (
  buffer: ArrayBuffer | Uint8Array,
  kind: SkinAssetKind,
): { readonly width: number; readonly height: number } => {
  const verdict = validatePngBuffer(buffer, kind);
  if (verdict.ok) return { width: verdict.width, height: verdict.height };
  throw new YggdrasilCoreError(YggdrasilCoreErrorCodes.INVALID_PNG, verdict.reason, {
    context: { kind },
  });
};
