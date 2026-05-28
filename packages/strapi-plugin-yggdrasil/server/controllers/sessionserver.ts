import {
  type GameProfile,
  HasJoinedQuerySchema,
  JoinRequestSchema,
  ProfileLookupParamSchema,
  ProfileLookupQuerySchema,
  undashUuid,
} from '@loontail/yggdrasil-core';
import type { JoinSessionsService } from '../services/join-sessions';
import type { TexturesPropertyService } from '../services/textures-property';
import type { TokensService } from '../services/tokens';
import type { UsersService, YggdrasilUserRow } from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';
import { YggdrasilHttpError, parseOrThrow, pluginService } from './helpers';

const HTTP_NO_CONTENT = 204;
const HTTP_FORBIDDEN = 403;

const buildProfile = async (
  strapi: StrapiInstance,
  user: YggdrasilUserRow,
  signed: boolean,
): Promise<GameProfile> => {
  if (!user.uuid) {
    throw new YggdrasilHttpError(
      HTTP_FORBIDDEN,
      'ForbiddenOperationException',
      'Profile has no UUID.',
    );
  }
  const textures = pluginService<TexturesPropertyService>(strapi, 'textures-property');
  const property = await textures.build(user, { signed });
  return {
    id: user.uuid,
    name: user.username,
    ...(property ? { properties: [property] } : {}),
  };
};

export default ({ strapi }: { strapi: StrapiInstance }) => ({
  async join(ctx: KoaContext) {
    const body = parseOrThrow(ctx, JoinRequestSchema, ctx.request.body);
    const tokens = pluginService<TokensService>(strapi, 'tokens');
    const users = pluginService<UsersService>(strapi, 'users');
    const joinSessions = pluginService<JoinSessionsService>(strapi, 'join-sessions');

    const token = await tokens.validate(body.accessToken);
    if (!token) {
      throw new YggdrasilHttpError(HTTP_FORBIDDEN, 'ForbiddenOperationException', 'Invalid token.');
    }
    const owner = await users.findById(token.userId);
    if (!owner || !owner.uuid || owner.uuid.toLowerCase() !== body.selectedProfile.toLowerCase()) {
      throw new YggdrasilHttpError(
        HTTP_FORBIDDEN,
        'ForbiddenOperationException',
        'Profile does not match access token.',
      );
    }
    const ip = ctx.request.ip;
    await joinSessions.put(body.serverId, ip ? { userId: owner.id, ip } : { userId: owner.id });
    ctx.status = HTTP_NO_CONTENT;
    ctx.body = null;
  },

  async hasJoined(ctx: KoaContext) {
    const query = parseOrThrow(ctx, HasJoinedQuerySchema, ctx.request.query);
    const users = pluginService<UsersService>(strapi, 'users');
    const joinSessions = pluginService<JoinSessionsService>(strapi, 'join-sessions');

    const entry = await joinSessions.take(query.serverId);
    if (!entry) {
      ctx.status = HTTP_NO_CONTENT;
      ctx.body = null;
      return;
    }
    if (query.ip && entry.ip && entry.ip !== query.ip) {
      ctx.status = HTTP_NO_CONTENT;
      ctx.body = null;
      return;
    }
    const user = await users.findById(entry.userId);
    if (!user || user.blocked || user.username.toLowerCase() !== query.username.toLowerCase()) {
      ctx.status = HTTP_NO_CONTENT;
      ctx.body = null;
      return;
    }
    ctx.body = await buildProfile(strapi, user, true);
  },

  async profile(ctx: KoaContext) {
    const params = parseOrThrow(ctx, ProfileLookupParamSchema, ctx.params);
    const query = parseOrThrow(ctx, ProfileLookupQuerySchema, ctx.request.query);
    const users = pluginService<UsersService>(strapi, 'users');
    const found = await users.findByUuid(undashUuid(params.uuid));
    if (!found || found.blocked) {
      ctx.status = HTTP_NO_CONTENT;
      ctx.body = null;
      return;
    }
    // Mojang's vanilla client refuses unsigned payloads; default to signed.
    const signed = query.unsigned !== true;
    ctx.body = await buildProfile(strapi, found, signed);
  },
});
