import type { GameProfile, YggdrasilUser } from './profile.js';

export type YggdrasilSession = {
  readonly accessToken: string;
  readonly clientToken: string;
  readonly availableProfiles: readonly GameProfile[];
  readonly selectedProfile: GameProfile;
  readonly user?: YggdrasilUser;
};
