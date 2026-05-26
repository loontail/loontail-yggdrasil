import { describe, expect, it } from 'vitest';
import {
  YggdrasilCoreError,
  YggdrasilCoreErrorCodes,
  buildTexturesPayload,
  encodeTexturesPayloadBase64,
} from '../src/index.js';

const PROFILE_ID = 'aabbccddeeff00112233445566778899';

describe('buildTexturesPayload', () => {
  it('omits SKIN.metadata for the classic variant', () => {
    const payload = buildTexturesPayload({
      profileId: PROFILE_ID,
      profileName: 'Steve',
      skin: { url: 'https://example.com/s.png', variant: 'CLASSIC' },
      timestamp: 1_700_000_000_000,
    });
    expect(payload.textures.SKIN).toEqual({ url: 'https://example.com/s.png' });
  });

  it('emits SKIN.metadata.model="slim" for the slim variant', () => {
    const payload = buildTexturesPayload({
      profileId: PROFILE_ID,
      profileName: 'Alex',
      skin: { url: 'https://example.com/s.png', variant: 'SLIM' },
      timestamp: 1_700_000_000_000,
    });
    expect(payload.textures.SKIN).toEqual({
      url: 'https://example.com/s.png',
      metadata: { model: 'slim' },
    });
  });

  it('emits a CAPE entry without metadata', () => {
    const payload = buildTexturesPayload({
      profileId: PROFILE_ID,
      profileName: 'Steve',
      cape: { url: 'https://example.com/c.png' },
    });
    expect(payload.textures.CAPE).toEqual({ url: 'https://example.com/c.png' });
  });

  it('rejects a non-hex profileId', () => {
    expect(() =>
      buildTexturesPayload({
        profileId: 'not-a-uuid',
        profileName: 'Steve',
      }),
    ).toThrowError(YggdrasilCoreError);
  });

  it('rejects an empty profileName', () => {
    try {
      buildTexturesPayload({ profileId: PROFILE_ID, profileName: '' });
      expect.fail('expected throw');
    } catch (err) {
      expect((err as YggdrasilCoreError).code).toBe(YggdrasilCoreErrorCodes.INVALID_TEXTURES_INPUT);
    }
  });

  it('defaults timestamp to Date.now()', () => {
    const before = Date.now();
    const payload = buildTexturesPayload({
      profileId: PROFILE_ID,
      profileName: 'Steve',
    });
    const after = Date.now();
    expect(payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(payload.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('encodeTexturesPayloadBase64', () => {
  it('produces a round-trippable base64 of the JSON', () => {
    const payload = buildTexturesPayload({
      profileId: PROFILE_ID,
      profileName: 'Steve',
      skin: { url: 'https://example.com/s.png', variant: 'CLASSIC' },
      timestamp: 1_700_000_000_000,
    });
    const b64 = encodeTexturesPayloadBase64(payload);
    const decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    expect(decoded).toEqual(payload);
  });
});
