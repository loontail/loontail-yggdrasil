import { describe, expect, it } from 'vitest';
import {
  YggdrasilCoreError,
  YggdrasilCoreErrorCodes,
  dashUuid,
  isUuidDashed,
  isUuidUndashed,
  randomUndashedUuid,
  undashUuid,
} from '../src/index.js';

const UNDASHED = 'aabbccddeeff00112233445566778899';
const DASHED = 'aabbccdd-eeff-0011-2233-445566778899';

describe('uuid helpers', () => {
  it('detects undashed and dashed shapes', () => {
    expect(isUuidUndashed(UNDASHED)).toBe(true);
    expect(isUuidUndashed(DASHED)).toBe(false);
    expect(isUuidDashed(DASHED)).toBe(true);
    expect(isUuidDashed(UNDASHED)).toBe(false);
  });

  it('undashUuid accepts both shapes and lowercases the output', () => {
    expect(undashUuid(UNDASHED.toUpperCase())).toBe(UNDASHED);
    expect(undashUuid(DASHED.toUpperCase())).toBe(UNDASHED);
  });

  it('dashUuid accepts both shapes and lowercases the output', () => {
    expect(dashUuid(UNDASHED.toUpperCase())).toBe(DASHED);
    expect(dashUuid(DASHED.toUpperCase())).toBe(DASHED);
  });

  it('throws YggdrasilCoreError(invalid_uuid) for invalid input', () => {
    try {
      undashUuid('not a uuid');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(YggdrasilCoreError);
      expect((err as YggdrasilCoreError).code).toBe(YggdrasilCoreErrorCodes.INVALID_UUID);
    }
  });

  it('randomUndashedUuid produces a 32-char lowercase hex string', () => {
    for (let i = 0; i < 16; i++) {
      const id = randomUndashedUuid();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
