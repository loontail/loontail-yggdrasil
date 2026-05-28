import { YggdrasilCoreError, YggdrasilCoreErrorCodes } from '../errors/yggdrasil-core-error.js';
import type { PlayerUuid } from '../types/branded.js';
import { asPlayerUuid } from '../types/branded.js';

const UNDASHED_RE = /^[0-9a-f]{32}$/i;
const DASHED_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuidUndashed = (value: string): boolean => UNDASHED_RE.test(value);

export const isUuidDashed = (value: string): boolean => DASHED_RE.test(value);

const truncated = (value: string): string => (value.length > 48 ? `${value.slice(0, 48)}…` : value);

export const undashUuid = (value: string): PlayerUuid => {
  if (isUuidUndashed(value)) return asPlayerUuid(value.toLowerCase());
  if (isUuidDashed(value)) return asPlayerUuid(value.replace(/-/g, '').toLowerCase());
  throw new YggdrasilCoreError(
    YggdrasilCoreErrorCodes.INVALID_UUID,
    `Value is not a valid UUID: ${truncated(value)}`,
    { context: { value } },
  );
};

export const dashUuid = (value: string): string => {
  if (isUuidDashed(value)) return value.toLowerCase();
  if (!isUuidUndashed(value)) {
    throw new YggdrasilCoreError(
      YggdrasilCoreErrorCodes.INVALID_UUID,
      `Value is not a valid UUID: ${truncated(value)}`,
      { context: { value } },
    );
  }
  const v = value.toLowerCase();
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
};

export const randomUndashedUuid = (): PlayerUuid => undashUuid(globalThis.crypto.randomUUID());
