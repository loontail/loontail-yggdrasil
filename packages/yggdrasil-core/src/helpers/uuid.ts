import { YggdrasilCoreError, YggdrasilCoreErrorCodes } from '../errors/yggdrasil-core-error.js';
import type { PlayerUuid } from '../types/branded.js';
import { asPlayerUuid } from '../types/branded.js';

const UNDASHED_RE = /^[0-9a-f]{32}$/i;
const DASHED_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `value` is a 32-character undashed hex UUID. */
export const isUuidUndashed = (value: string): boolean => UNDASHED_RE.test(value);

/** True if `value` is a 36-character dashed hex UUID. */
export const isUuidDashed = (value: string): boolean => DASHED_RE.test(value);

/**
 * Strip dashes from a UUID. Accepts either dashed or already-undashed
 * input. Throws {@link YggdrasilCoreError} with code
 * `invalid_uuid` if the input matches neither shape.
 */
export const undashUuid = (value: string): PlayerUuid => {
  if (isUuidUndashed(value)) return asPlayerUuid(value.toLowerCase());
  if (isUuidDashed(value)) return asPlayerUuid(value.replace(/-/g, '').toLowerCase());
  throw new YggdrasilCoreError(
    YggdrasilCoreErrorCodes.INVALID_UUID,
    `Value is not a valid UUID: ${truncate(value)}`,
    { context: { value } },
  );
};

/**
 * Insert dashes into an undashed UUID. Returns dashed input unchanged.
 * Throws if the input matches neither shape.
 */
export const dashUuid = (value: string): string => {
  if (isUuidDashed(value)) return value.toLowerCase();
  if (!isUuidUndashed(value)) {
    throw new YggdrasilCoreError(
      YggdrasilCoreErrorCodes.INVALID_UUID,
      `Value is not a valid UUID: ${truncate(value)}`,
      { context: { value } },
    );
  }
  const v = value.toLowerCase();
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
};

/**
 * Generate a fresh UUIDv4 and return it as a 32-character undashed
 * hex string. Uses `globalThis.crypto.randomUUID` (Node ≥ 19, browser).
 *
 * @example
 * ```ts
 * const uuid = randomUndashedUuid();
 * // → '7f3c2d8a4b194d6c8a2f9e1b3d4c5f6a'
 * ```
 */
export const randomUndashedUuid = (): PlayerUuid => undashUuid(globalThis.crypto.randomUUID());

const truncate = (value: string): string => (value.length > 48 ? `${value.slice(0, 48)}…` : value);
