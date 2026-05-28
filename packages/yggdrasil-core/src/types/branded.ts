export type PlayerUuid = string & { readonly __brand: 'PlayerUuid' };
export type AccessToken = string & { readonly __brand: 'AccessToken' };
export type ClientToken = string & { readonly __brand: 'ClientToken' };
export type ServerId = string & { readonly __brand: 'ServerId' };

export const asPlayerUuid = (value: string): PlayerUuid => value as PlayerUuid;
