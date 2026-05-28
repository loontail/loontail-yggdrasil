import {
  AuthenticateRequestSchema,
  InvalidateRequestSchema,
  RefreshRequestSchema,
  ValidateRequestSchema,
  YggdrasilErrorKinds,
  type YggdrasilSession,
} from '@loontail/yggdrasil-core';
import type { PasswordsService } from '../services/passwords';
import type { TokensService } from '../services/tokens';
import {
  type UsersService,
  type YggdrasilUserRow,
  isYggdrasilUserEligible,
} from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';
import { YggdrasilHttpError, parseOrThrow, pluginService } from './helpers';

const HTTP_FORBIDDEN = 403;
const HTTP_NO_CONTENT = 204;
const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials. Invalid username or password.';
const INVALID_TOKEN_MESSAGE = 'Invalid token.';

const ensureEligible = <T extends Pick<YggdrasilUserRow, 'blocked' | 'confirmed'>>(
  user: T | null,
  message = INVALID_CREDENTIALS_MESSAGE,
): T => {
  if (!isYggdrasilUserEligible(user)) {
    throw new YggdrasilHttpError(HTTP_FORBIDDEN, YggdrasilErrorKinds.Forbidden, message);
  }
  return user;
};

const sessionFor = (
  user: YggdrasilUserRow,
  accessToken: string,
  clientToken: string,
  includeUser: boolean,
): YggdrasilSession => {
  const profile = { id: user.uuid as string, name: user.username };
  return {
    accessToken,
    clientToken,
    availableProfiles: [profile],
    selectedProfile: profile,
    ...(includeUser ? { user: { id: profile.id } } : {}),
  };
};

export default ({ strapi }: { strapi: StrapiInstance }) => ({
  async authenticate(ctx: KoaContext) {
    const body = parseOrThrow(ctx, AuthenticateRequestSchema, ctx.request.body);
    const users = pluginService<UsersService>(strapi, 'users');
    const passwords = pluginService<PasswordsService>(strapi, 'passwords');
    const tokens = pluginService<TokensService>(strapi, 'tokens');

    const found = ensureEligible(await users.findByIdentifierWithPassword(body.username));
    const passwordOk = await passwords.validate(body.password, found.password);
    if (!passwordOk) {
      throw new YggdrasilHttpError(
        HTTP_FORBIDDEN,
        YggdrasilErrorKinds.Forbidden,
        INVALID_CREDENTIALS_MESSAGE,
      );
    }

    const uuid = await users.ensureUuid(found.id);
    const issued = await tokens.issue(found.id, body.clientToken);
    ctx.body = sessionFor(
      { ...found, uuid },
      issued.accessToken,
      issued.clientToken,
      !!body.requestUser,
    );
  },

  async refresh(ctx: KoaContext) {
    const body = parseOrThrow(ctx, RefreshRequestSchema, ctx.request.body);
    const tokens = pluginService<TokensService>(strapi, 'tokens');
    const users = pluginService<UsersService>(strapi, 'users');

    const current = await tokens.validate(body.accessToken, body.clientToken);
    if (!current) {
      throw new YggdrasilHttpError(
        HTTP_FORBIDDEN,
        YggdrasilErrorKinds.Forbidden,
        INVALID_TOKEN_MESSAGE,
      );
    }
    const found = ensureEligible(await users.findById(current.userId), INVALID_TOKEN_MESSAGE);
    if (!found.uuid) {
      throw new YggdrasilHttpError(
        HTTP_FORBIDDEN,
        YggdrasilErrorKinds.Forbidden,
        'Profile not initialized.',
      );
    }
    const rotated = await tokens.refresh(body.accessToken, body.clientToken);
    if (!rotated) {
      throw new YggdrasilHttpError(
        HTTP_FORBIDDEN,
        YggdrasilErrorKinds.Forbidden,
        INVALID_TOKEN_MESSAGE,
      );
    }
    ctx.body = sessionFor(found, rotated.accessToken, rotated.clientToken, !!body.requestUser);
  },

  async validate(ctx: KoaContext) {
    const body = parseOrThrow(ctx, ValidateRequestSchema, ctx.request.body);
    const tokens = pluginService<TokensService>(strapi, 'tokens');
    const users = pluginService<UsersService>(strapi, 'users');
    const validated = await tokens.validate(body.accessToken, body.clientToken);
    if (!validated) {
      throw new YggdrasilHttpError(
        HTTP_FORBIDDEN,
        YggdrasilErrorKinds.Forbidden,
        INVALID_TOKEN_MESSAGE,
      );
    }
    const found = ensureEligible(await users.findById(validated.userId), INVALID_TOKEN_MESSAGE);
    if (!found.uuid) {
      throw new YggdrasilHttpError(
        HTTP_FORBIDDEN,
        YggdrasilErrorKinds.Forbidden,
        'Profile not initialized.',
      );
    }
    ctx.status = HTTP_NO_CONTENT;
    ctx.body = null;
  },

  async invalidate(ctx: KoaContext) {
    const body = parseOrThrow(ctx, InvalidateRequestSchema, ctx.request.body);
    const tokens = pluginService<TokensService>(strapi, 'tokens');
    await tokens.invalidate(body.accessToken, body.clientToken);
    ctx.status = HTTP_NO_CONTENT;
    ctx.body = null;
  },
});
