/**
 * Admin-namespace routes for the textures subsystem. Mounted under
 * `/admin/api/yggdrasil/textures/*` and protected by Strapi's default
 * admin auth chain (the admin JWT). These power the plugin's admin
 * UI — listing, on-behalf-of upload, validate, purge-missing.
 */
const routes = {
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/textures/skins',
      handler: 'textures.listSkins',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/textures/capes',
      handler: 'textures.listCapes',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/textures/upload/skin',
      handler: 'textures.adminUploadSkin',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/textures/upload/cape',
      handler: 'textures.adminUploadCape',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/textures/skins/:id',
      handler: 'textures.adminDeleteSkin',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/textures/capes/:id',
      handler: 'textures.adminDeleteCape',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/textures/validate',
      handler: 'textures.validate',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/textures/purge-missing',
      handler: 'textures.purgeMissing',
      config: { policies: [] },
    },
  ],
};

export default routes;
