import { BulkProfilesRequestSchema } from '@loontail/yggdrasil-core';
import { type UsersService, isYggdrasilUserEligible } from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';
import { parseOrThrow, pluginService } from './helpers';

type ProfileSummary = { id: string; name: string };

export default ({ strapi }: { strapi: StrapiInstance }) => ({
  async bulkProfiles(ctx: KoaContext) {
    const names = parseOrThrow(ctx, BulkProfilesRequestSchema, ctx.request.body);
    const users = pluginService<UsersService>(strapi, 'users');
    const resolved = await Promise.all(
      names.map(async (name): Promise<ProfileSummary | null> => {
        const row = await users.findByUsername(name);
        if (!isYggdrasilUserEligible(row) || !row.uuid) return null;
        return { id: row.uuid, name: row.username };
      }),
    );
    ctx.body = resolved.filter((r): r is ProfileSummary => r !== null);
  },
});
