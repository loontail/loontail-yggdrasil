const routes = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/textures/:uuid',
      handler: 'textures.getTextures',
      config: { auth: false, policies: [] },
    },
    {
      method: 'PUT',
      path: '/textures/skin',
      handler: 'textures.uploadSkin',
      config: { auth: false, policies: ['plugin::yggdrasil.yggdrasil-token-auth'] },
    },
    {
      method: 'PUT',
      path: '/textures/cape',
      handler: 'textures.uploadCape',
      config: { auth: false, policies: ['plugin::yggdrasil.yggdrasil-token-auth'] },
    },
    {
      method: 'DELETE',
      path: '/textures/skin',
      handler: 'textures.deleteSkin',
      config: { auth: false, policies: ['plugin::yggdrasil.yggdrasil-token-auth'] },
    },
    {
      method: 'DELETE',
      path: '/textures/cape',
      handler: 'textures.deleteCape',
      config: { auth: false, policies: ['plugin::yggdrasil.yggdrasil-token-auth'] },
    },
  ],
};

export default routes;
