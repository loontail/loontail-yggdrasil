import type { GameProfile, YggdrasilUser } from './profile.js';

/**
 * The payload returned by `/authserver/authenticate` and
 * `/authserver/refresh`. Used by clients to authorize subsequent
 * `validate` / `invalidate` / `join` calls.
 */
export type YggdrasilSession = {
  readonly accessToken: string;
  readonly clientToken: string;
  readonly availableProfiles: readonly GameProfile[];
  readonly selectedProfile: GameProfile;
  readonly user?: YggdrasilUser;
};
