import api from './api.routes';
import authserver from './authserver.routes';
import root from './root.routes';
import sessionserver from './sessionserver.routes';
import texturesAdmin from './textures-admin.routes';
import textures from './textures.routes';

const contentApi = {
  type: 'content-api' as const,
  routes: [
    ...root.routes,
    ...authserver.routes,
    ...sessionserver.routes,
    ...api.routes,
    ...textures.routes,
  ],
};

const admin = {
  type: 'admin' as const,
  routes: [...texturesAdmin.routes],
};

export default { 'content-api': contentApi, admin };
