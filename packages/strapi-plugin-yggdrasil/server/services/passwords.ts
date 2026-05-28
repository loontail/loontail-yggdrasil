import type { StrapiInstance } from '../types';

type UsersPermissionsUserService = {
  validatePassword(plain: string, hashed: string): Promise<boolean>;
};

export type PasswordsService = ReturnType<typeof createPasswordsService>;

export const createPasswordsService = ({ strapi }: { strapi: StrapiInstance }) => ({
  async validate(plain: string, hashed: string): Promise<boolean> {
    if (!plain || !hashed) return false;
    const service = strapi
      .plugin('users-permissions')
      .service('user') as UsersPermissionsUserService;
    return service.validatePassword(plain, hashed);
  },
});
