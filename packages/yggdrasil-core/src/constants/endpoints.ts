export const YggdrasilEndpoints = {
  root: '/',
  authenticate: '/authserver/authenticate',
  refresh: '/authserver/refresh',
  validate: '/authserver/validate',
  invalidate: '/authserver/invalidate',
  sessionJoin: '/sessionserver/session/minecraft/join',
  sessionHasJoined: '/sessionserver/session/minecraft/hasJoined',
  sessionProfile: '/sessionserver/session/minecraft/profile',
  bulkProfiles: '/api/profiles/minecraft',
  textures: '/textures',
  texturesSkin: '/textures/skin',
  texturesCape: '/textures/cape',
} as const;

export type YggdrasilEndpoint = (typeof YggdrasilEndpoints)[keyof typeof YggdrasilEndpoints];
