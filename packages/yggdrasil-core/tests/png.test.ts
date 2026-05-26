import { describe, expect, it } from 'vitest';
import {
  CAPE_VALID_DIMENSIONS,
  SKIN_VALID_DIMENSIONS,
  SkinAssetKinds,
  YggdrasilCoreError,
  YggdrasilCoreErrorCodes,
  assertPngBuffer,
  validatePngBuffer,
} from '../src/index.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const writeUInt32BE = (view: Uint8Array, offset: number, value: number): void => {
  view[offset] = (value >>> 24) & 0xff;
  view[offset + 1] = (value >>> 16) & 0xff;
  view[offset + 2] = (value >>> 8) & 0xff;
  view[offset + 3] = value & 0xff;
};

/** Build a 24-byte PNG header (signature + IHDR type + width/height). */
const makePngHeader = (width: number, height: number, ihdrType = 'IHDR'): Uint8Array => {
  const buf = new Uint8Array(24);
  buf.set(PNG_SIGNATURE, 0);
  // bytes 8..11 = IHDR chunk length (13). We don't validate this, but real
  // PNGs always have it.
  writeUInt32BE(buf, 8, 13);
  buf[12] = ihdrType.charCodeAt(0);
  buf[13] = ihdrType.charCodeAt(1);
  buf[14] = ihdrType.charCodeAt(2);
  buf[15] = ihdrType.charCodeAt(3);
  writeUInt32BE(buf, 16, width);
  writeUInt32BE(buf, 20, height);
  return buf;
};

describe('validatePngBuffer', () => {
  it('accepts a 64x64 skin', () => {
    const result = validatePngBuffer(makePngHeader(64, 64), SkinAssetKinds.SKIN);
    expect(result).toEqual({ ok: true, width: 64, height: 64 });
  });

  it('accepts a 64x32 legacy skin', () => {
    const result = validatePngBuffer(makePngHeader(64, 32), SkinAssetKinds.SKIN);
    expect(result).toEqual({ ok: true, width: 64, height: 32 });
  });

  it('accepts a 64x32 cape', () => {
    const result = validatePngBuffer(makePngHeader(64, 32), SkinAssetKinds.CAPE);
    expect(result).toEqual({ ok: true, width: 64, height: 32 });
  });

  it('rejects 64x64 for cape', () => {
    const result = validatePngBuffer(makePngHeader(64, 64), SkinAssetKinds.CAPE);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('cape dimensions 64x64');
  });

  it('rejects 128x128 skin (above supported sizes)', () => {
    const result = validatePngBuffer(makePngHeader(128, 128), SkinAssetKinds.SKIN);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('128x128');
  });

  it('rejects buffers shorter than the PNG header', () => {
    const result = validatePngBuffer(new Uint8Array(10), SkinAssetKinds.SKIN);
    expect(result).toEqual({
      ok: false,
      reason: 'file too small to be a PNG (need at least 24 bytes)',
    });
  });

  it('rejects non-PNG payloads (no signature)', () => {
    const jpegMagic = new Uint8Array(24);
    jpegMagic[0] = 0xff;
    jpegMagic[1] = 0xd8;
    jpegMagic[2] = 0xff;
    const result = validatePngBuffer(jpegMagic, SkinAssetKinds.SKIN);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('file is not a PNG');
  });

  it('rejects PNGs whose first chunk is not IHDR', () => {
    const result = validatePngBuffer(makePngHeader(64, 64, 'sBIT'), SkinAssetKinds.SKIN);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('"sBIT"');
  });

  it('accepts ArrayBuffer input (not just Uint8Array)', () => {
    const view = makePngHeader(64, 64);
    // Allocate a fresh ArrayBuffer so the type is unambiguously
    // `ArrayBuffer` (not the wider `ArrayBufferLike` of `Uint8Array.buffer`).
    const arrayBuffer = new ArrayBuffer(view.byteLength);
    new Uint8Array(arrayBuffer).set(view);
    const result = validatePngBuffer(arrayBuffer, SkinAssetKinds.SKIN);
    expect(result).toEqual({ ok: true, width: 64, height: 64 });
  });
});

describe('assertPngBuffer', () => {
  it('returns dimensions on success', () => {
    expect(assertPngBuffer(makePngHeader(64, 32), SkinAssetKinds.SKIN)).toEqual({
      width: 64,
      height: 32,
    });
  });

  it('throws YggdrasilCoreError(invalid_png) on a non-PNG payload', () => {
    try {
      assertPngBuffer(new Uint8Array(24), SkinAssetKinds.SKIN);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(YggdrasilCoreError);
      expect((err as YggdrasilCoreError).code).toBe(YggdrasilCoreErrorCodes.INVALID_PNG);
      expect((err as YggdrasilCoreError).context).toEqual({ kind: 'skin' });
    }
  });
});

describe('exported dimension tables', () => {
  it('skin allows both modern and legacy sizes', () => {
    expect([...SKIN_VALID_DIMENSIONS]).toEqual(['64x64', '64x32']);
  });

  it('cape only allows 64x32', () => {
    expect([...CAPE_VALID_DIMENSIONS]).toEqual(['64x32']);
  });
});
