export const YggdrasilCoreErrorCodes = {
  INVALID_UUID: 'invalid_uuid',
  INVALID_TEXTURES_INPUT: 'invalid_textures_input',
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
