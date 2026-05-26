import { YggdrasilHttpError } from '../controllers/helpers';
import type { TokensService } from '../services/tokens';
import type { UsersService, YggdrasilUserRow } from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';

const HTTP_UNAUTHORIZED = 401;

const BEARER_PREFIX = 'Bearer ';

const readBearer = (ctx: KoaContext): string | null => {
  const header =
    (ctx.request.header as Record<string, string | undefined>)?.authorization ??
    (ctx.request.header as Record<string, string | undefined>)?.Authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token || null;
};

export type YggdrasilAuthState = {
  readonly id: number;
  readonly uuid: string;
  readonly username: string;
};

declare module 'koa' {
  interface DefaultState {
    yggdrasilUser?: YggdrasilAuthState;
  }
}

const unauthorized = (cause: string): never => {
  throw new YggdrasilHttpError(
    HTTP_UNAUTHORIZED,
    'ForbiddenOperationException',
    'Invalid or expired access token.',
    cause,
  );
};

/**
 * Strapi v5 policy that authenticates a request via a Yggdrasil
 * access token (issued by `/authserver/authenticate`). On success it
 * attaches `ctx.state.yggdrasilUser = { id, uuid, username }` so the
 * controller can identify the caller without re-reading the token.
 * On failure it throws a Yggdrasil-shaped 401 — the `error-shape`
 * middleware translates it into the protocol's `{ error,
 * errorMessage }` envelope.
 */
const yggdrasilTokenAuth = async (
  ctx: KoaContext,
  _config: unknown,
  { strapi }: { strapi: StrapiInstance },
): Promise<boolean> => {
  const accessToken = readBearer(ctx);
  if (!accessToken) {
    unauthorized('missing-bearer');
    return false;
  }
  const tokens = strapi.plugin('yggdrasil').service('tokens') as TokensService;
  const validated = await tokens.validate(accessToken);
  if (!validated) {
    unauthorized('invalid-token');
    return false;
  }
  const users = strapi.plugin('yggdrasil').service('users') as UsersService;
  const user: YggdrasilUserRow | null = await users.findById(validated.userId);
  if (!user || user.blocked || !user.uuid) {
    unauthorized('user-not-eligible');
    return false;
  }
  (ctx.state as { yggdrasilUser?: YggdrasilAuthState }).yggdrasilUser = {
    id: user.id,
    uuid: user.uuid,
    username: user.username,
  };
  return true;
};

export default yggdrasilTokenAuth;
