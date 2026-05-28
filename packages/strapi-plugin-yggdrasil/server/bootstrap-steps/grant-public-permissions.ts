import type { StrapiInstance } from '../types';

const ROUTE_ACTIONS = [
  'plugin::yggdrasil.root.meta',
  'plugin::yggdrasil.authserver.authenticate',
  'plugin::yggdrasil.authserver.refresh',
  'plugin::yggdrasil.authserver.validate',
  'plugin::yggdrasil.authserver.invalidate',
  'plugin::yggdrasil.sessionserver.join',
  'plugin::yggdrasil.sessionserver.hasJoined',
  'plugin::yggdrasil.sessionserver.profile',
  'plugin::yggdrasil.api.bulkProfiles',
  'plugin::yggdrasil.textures.getTextures',
  'plugin::yggdrasil.textures.uploadSkin',
  'plugin::yggdrasil.textures.uploadCape',
  'plugin::yggdrasil.textures.deleteSkin',
  'plugin::yggdrasil.textures.deleteCape',
] as const;

export const grantPublicPermissions = async (strapi: StrapiInstance): Promise<void> => {
  const roleQuery = strapi.db.query('plugin::users-permissions.role');
  const permissionQuery = strapi.db.query('plugin::users-permissions.permission');
  const publicRole = (await roleQuery.findOne({ where: { type: 'public' } })) as {
    id: number;
  } | null;
  if (!publicRole) {
    strapi.log.warn('[yggdrasil] Public role not found; skipping permissions setup');
    return;
  }
  for (const action of ROUTE_ACTIONS) {
    const existing = await permissionQuery.findOne({
      where: { action, role: publicRole.id },
    });
    if (existing) continue;
    await permissionQuery.create({ data: { action, role: publicRole.id } });
    strapi.log.info(`[yggdrasil] Granted public permission for ${action}`);
  }
};
