/**
 * Branded string types used across the Yggdrasil packages.
 *
 * The brands are compile-time only (no runtime cost) and let callers
 * distinguish between otherwise-identical strings — for instance a
 * {@link PlayerUuid} cannot accidentally be passed where an
 * {@link AccessToken} is expected.
 */

export type PlayerUuid = string & { readonly __brand: 'PlayerUuid' };
export type AccessToken = string & { readonly __brand: 'AccessToken' };
export type ClientToken = string & { readonly __brand: 'ClientToken' };
export type ServerId = string & { readonly __brand: 'ServerId' };

/** Cast a plain string into a {@link PlayerUuid} without validation. */
export const asPlayerUuid = (value: string): PlayerUuid => value as PlayerUuid;

/** Cast a plain string into an {@link AccessToken} without validation. */
export const asAccessToken = (value: string): AccessToken => value as AccessToken;

/** Cast a plain string into a {@link ClientToken} without validation. */
export const asClientToken = (value: string): ClientToken => value as ClientToken;

/** Cast a plain string into a {@link ServerId} without validation. */
export const asServerId = (value: string): ServerId => value as ServerId;
