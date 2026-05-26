/**
 * Wire-format error body used by every Yggdrasil endpoint that does
 * not return 204. Mirrors the Mojang error envelope.
 *
 * @example
 * ```ts
 * const body: YggdrasilErrorBody = {
 *   error: 'ForbiddenOperationException',
 *   errorMessage: 'Invalid credentials. Invalid username or password.',
 * };
 * ```
 */
export type YggdrasilErrorBody = {
  readonly error: string;
  readonly errorMessage: string;
  readonly cause?: string;
};

/** Canonical `error` values used by the official Mojang Yggdrasil. */
export const YggdrasilErrorKinds = {
  Forbidden: 'ForbiddenOperationException',
  IllegalArgument: 'IllegalArgumentException',
  Resource: 'ResourceException',
} as const;
export type YggdrasilErrorKind = (typeof YggdrasilErrorKinds)[keyof typeof YggdrasilErrorKinds];
