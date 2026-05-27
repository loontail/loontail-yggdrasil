import type { YggdrasilErrorBody } from '@loontail/yggdrasil-core';

/**
 * Error codes thrown from {@link YggdrasilClient}. Wire-level Yggdrasil
 * errors are wrapped under {@link YggdrasilClientErrorCodes.HTTP_ERROR}
 * with the parsed body attached via `context.body`.
 */
export const YggdrasilClientErrorCodes = {
  /** Network failure (DNS, TCP, abort) before the server returned a status. */
  NETWORK: 'network',
  /** Server returned a non-2xx response. Body — when JSON — is in `context.body`. */
  HTTP_ERROR: 'http_error',
  /** Server returned 2xx but the body could not be parsed against the schema. */
  INVALID_RESPONSE: 'invalid_response',
  /** Caller-supplied input violated a documented client-side invariant. */
  INVALID_REQUEST: 'invalid_request',
  /** authlib-injector jar could not be located in the bundled vendor folder. */
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

/**
 * Narrowing type guard combining {@link isYggdrasilClientError} with a
 * code check. After this returns `true`, `value` is typed as a
 * `YggdrasilClientError` and `value.context.<field>` can be accessed
 * without a cast.
 *
 * @example
 * ```ts
 * try {
 *   await client.authenticate({ username, password });
 * } catch (err) {
 *   if (isYggdrasilClientErrorCode(err, YggdrasilClientErrorCodes.HTTP_ERROR)) {
 *     if (err.context?.status === 403) return promptForFreshCredentials();
 *     if (err.context?.body?.error === 'IllegalArgumentException') return showBadInput();
 *   }
 *   throw err;
 * }
 * ```
 */
export const isYggdrasilClientErrorCode = (
  value: unknown,
  code: YggdrasilClientErrorCode,
): value is YggdrasilClientError => isYggdrasilClientError(value) && value.code === code;
