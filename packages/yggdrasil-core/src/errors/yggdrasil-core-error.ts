/**
 * Error codes thrown from `@loontail/yggdrasil-core` helpers. Codes
 * are stable strings; the underlying `YggdrasilCoreError` class can be
 * inspected with the type guards exported below.
 */
export const YggdrasilCoreErrorCodes = {
  /** A UUID-like input failed shape validation. */
  INVALID_UUID: 'invalid_uuid',
  /** A `BuildTexturesPayloadInput` field failed validation. */
  INVALID_TEXTURES_INPUT: 'invalid_textures_input',
  /** A PNG buffer failed signature or dimension validation. */
  INVALID_PNG: 'invalid_png',
} as const;

export type YggdrasilCoreErrorCode =
  (typeof YggdrasilCoreErrorCodes)[keyof typeof YggdrasilCoreErrorCodes];

export type YggdrasilCoreErrorOptions = {
  readonly cause?: unknown;
  readonly context?: Readonly<Record<string, unknown>>;
};

export class YggdrasilCoreError extends Error {
  readonly code: YggdrasilCoreErrorCode;
  readonly context?: Readonly<Record<string, unknown>>;

  constructor(code: YggdrasilCoreErrorCode, message: string, options?: YggdrasilCoreErrorOptions) {
    super(message);
    this.name = 'YggdrasilCoreError';
    this.code = code;
    if (options?.context) {
      this.context = Object.freeze({ ...options.context });
    }
    if (options?.cause !== undefined) {
      // Surface via the standard Error `cause` so logs can inspect it.
      (this as unknown as { cause: unknown }).cause = options.cause;
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, YggdrasilCoreError);
    }
  }
}

export const isYggdrasilCoreError = (value: unknown): value is YggdrasilCoreError =>
  value instanceof YggdrasilCoreError;

export const isYggdrasilCoreErrorCode = (
  value: unknown,
  code: YggdrasilCoreErrorCode,
): value is YggdrasilCoreError => isYggdrasilCoreError(value) && value.code === code;
