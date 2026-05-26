/**
 * Endpoint paths relative to the Yggdrasil API root. All paths
 * include the leading slash and do not include a trailing slash.
 *
 * @example
 * ```ts
 * fetch(`${apiRoot}${YggdrasilEndpoints.authenticate}`, …);
 * ```
 */
export const YggdrasilEndpoints = {
  root: '/',
  authenticate: '/authserver/authenticate',
  refresh: '/authserver/refresh',
  validate: '/authserver/validate',
  invalidate: '/authserver/invalidate',
  sessionJoin: '/sessionserver/session/minecraft/join',
  sessionHasJoined: '/sessionserver/session/minecraft/hasJoined',
  /** Append `/<undashed-uuid>` (and optional `?unsigned=…`). */
  sessionProfile: '/sessionserver/session/minecraft/profile',
  bulkProfiles: '/api/profiles/minecraft',
} as const;

export type YggdrasilEndpoint = (typeof YggdrasilEndpoints)[keyof typeof YggdrasilEndpoints];
