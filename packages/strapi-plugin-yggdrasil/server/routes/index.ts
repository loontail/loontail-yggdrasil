import api from './api.routes';
import authserver from './authserver.routes';
import root from './root.routes';
import sessionserver from './sessionserver.routes';
import texturesAdmin from './textures-admin.routes';
import textures from './textures.routes';

/**
 * Strapi exposes a plugin's routes under two namespaces:
 * - `content-api` is mounted at `/api/<plugin>/<path>` (the Yggdrasil
 *   protocol + public texture reads + token-protected mutations).
 * - `admin` is mounted at `/admin/api/<plugin>/<path>` (the admin UI's
 *   backing endpoints).
 *
 * Both are composed from per-feature route files for readability.
 */
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
