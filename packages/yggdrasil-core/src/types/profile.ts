/**
 * Yggdrasil profile types — the shape returned by `hasJoined`,
 * `/profile/:uuid`, and the `selectedProfile` / `availableProfiles`
 * fields of an authenticate / refresh response.
 */

export type GameProfileProperty = {
  readonly name: string;
  readonly value: string;
  readonly signature?: string;
};

export type GameProfile = {
  readonly id: string;
  readonly name: string;
  readonly properties?: readonly GameProfileProperty[];
};

export type YggdrasilUser = {
  readonly id: string;
  readonly properties?: readonly GameProfileProperty[];
};
