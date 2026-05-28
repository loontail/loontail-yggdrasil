const routes = {
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/textures/skins',
      handler: 'textures-admin.listSkins',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/textures/capes',
      handler: 'textures-admin.listCapes',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/textures/upload/skin',
      handler: 'textures-admin.uploadSkin',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/textures/upload/cape',
      handler: 'textures-admin.uploadCape',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/textures/skins/:id',
      handler: 'textures-admin.deleteSkin',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/textures/capes/:id',
      handler: 'textures-admin.deleteCape',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/textures/validate',
      handler: 'textures-admin.validate',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/textures/purge-missing',
      handler: 'textures-admin.purgeMissing',
      config: { policies: [] },
    },
  ],
};

export default routes;
