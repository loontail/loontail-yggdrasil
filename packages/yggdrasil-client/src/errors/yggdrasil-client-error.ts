import type { YggdrasilErrorBody } from '@loontail/yggdrasil-core';

export const YggdrasilClientErrorCodes = {
  NETWORK: 'network',
  HTTP_ERROR: 'http_error',
  INVALID_RESPONSE: 'invalid_response',
  INVALID_REQUEST: 'invalid_request',
  AUTHLIB_INJECTOR_MISSING: 'authlib_injector_missing',
} as const;

export type YggdrasilClientErrorCode =
  (typeof YggdrasilClientErrorCodes)[keyof typeof YggdrasilClientErrorCodes];

export type YggdrasilClientErrorContext = {
  readonly status?: number;
  readonly body?: YggdrasilErrorBody;
  readonly url?: string;
  readonly [k: string]: unknown;
};

export type YggdrasilClientErrorOptions = {
  readonly cause?: unknown;
  readonly context?: YggdrasilClientErrorContext;
};

export class YggdrasilClientError extends Error {
  readonly code: YggdrasilClientErrorCode;
  readonly context?: YggdrasilClientErrorContext;

  constructor(
    code: YggdrasilClientErrorCode,
    message: string,
    options?: YggdrasilClientErrorOptions,
  ) {
    super(message);
    this.name = 'YggdrasilClientError';
    this.code = code;
    if (options?.context) {
      this.context = Object.freeze({ ...options.context });
    }
    if (options?.cause !== undefined) {
      (this as unknown as { cause: unknown }).cause = options.cause;
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, YggdrasilClientError);
    }
  }
}

export const isYggdrasilClientError = (value: unknown): value is YggdrasilClientError =>
  value instanceof YggdrasilClientError;

export const isYggdrasilClientErrorCode = (
  value: unknown,
  code: YggdrasilClientErrorCode,
): value is YggdrasilClientError => isYggdrasilClientError(value) && value.code === code;
