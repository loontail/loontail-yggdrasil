import { describe, expect, it, vi } from 'vitest';
import { isYggdrasilHttpError } from '../controllers/helpers';
import type { TokensService, ValidatedToken } from '../services/tokens';
import type { UsersService, YggdrasilUserRow } from '../services/users';
import type { KoaContext, StrapiInstance } from '../types';
import yggdrasilTokenAuth from './yggdrasil-token-auth';

type ServiceMap = {
  readonly tokens?: Partial<TokensService>;
  readonly users?: Partial<UsersService>;
};

const buildStrapi = (services: ServiceMap): StrapiInstance =>
  ({
    log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    dirs: { app: { root: '/tmp', src: '/tmp' } },
    config: { get: () => undefined },
    db: {
      connection: (() => ({})) as unknown as StrapiInstance['db']['connection'],
      query: () => ({
        findOne: async () => null,
        findMany: async () => [],
        create: async () => null,
        update: async () => null,
        delete: async () => null,
        count: async () => 0,
      }),
    },
    plugin: (_name: string) => ({
      service: (name: string) => {
        if (name === 'tokens') return services.tokens ?? {};
        if (name === 'users') return services.users ?? {};
        return {};
      },
      config: () => undefined,
    }),
  }) as unknown as StrapiInstance;

const buildCtx = (header: Record<string, string | undefined> = {}): KoaContext =>
  ({
    request: { header },
    state: {},
  }) as unknown as KoaContext;

const validatedToken = (userId: number): ValidatedToken => ({
  id: 1,
  userId,
  accessToken: 'aaaa',
  clientToken: 'cccc',
});

const userRow = (overrides: Partial<YggdrasilUserRow> = {}): YggdrasilUserRow => ({
  id: 42,
  username: 'steve',
  uuid: '00000000000000000000000000000042',
  blocked: false,
  confirmed: true,
  ...overrides,
});

describe('yggdrasilTokenAuth policy', () => {
  it('rejects requests without a Bearer header', async () => {
    const strapi = buildStrapi({});
    const ctx = buildCtx({});
    await expect(yggdrasilTokenAuth(ctx, undefined, { strapi })).rejects.toSatisfy((err) => {
      return isYggdrasilHttpError(err) && err.status === 401;
    });
  });

  it('rejects requests whose Authorization header is not Bearer', async () => {
    const strapi = buildStrapi({});
    const ctx = buildCtx({ authorization: 'Basic abc' });
    await expect(yggdrasilTokenAuth(ctx, undefined, { strapi })).rejects.toSatisfy((err) => {
      return isYggdrasilHttpError(err) && err.status === 401;
    });
  });

  it('rejects requests with an unknown token', async () => {
    const validate = vi.fn().mockResolvedValue(null);
    const strapi = buildStrapi({ tokens: { validate } });
    const ctx = buildCtx({ authorization: 'Bearer expired' });
    await expect(yggdrasilTokenAuth(ctx, undefined, { strapi })).rejects.toSatisfy((err) => {
      return isYggdrasilHttpError(err) && err.status === 401;
    });
    expect(validate).toHaveBeenCalledWith('expired');
  });

  it('rejects when the user lookup fails after a valid token', async () => {
    const validate = vi.fn().mockResolvedValue(validatedToken(42));
    const findById = vi.fn().mockResolvedValue(null);
    const strapi = buildStrapi({
      tokens: { validate },
      users: { findById },
    });
    const ctx = buildCtx({ authorization: 'Bearer good' });
    await expect(yggdrasilTokenAuth(ctx, undefined, { strapi })).rejects.toSatisfy((err) => {
      return isYggdrasilHttpError(err) && err.status === 401;
    });
    expect(findById).toHaveBeenCalledWith(42);
  });

  it('rejects when the user is blocked or has no UUID', async () => {
    const validate = vi.fn().mockResolvedValue(validatedToken(42));
    const findById = vi.fn().mockResolvedValue(userRow({ blocked: true }));
    const strapi = buildStrapi({
      tokens: { validate },
      users: { findById },
    });
    const ctx = buildCtx({ authorization: 'Bearer good' });
    await expect(yggdrasilTokenAuth(ctx, undefined, { strapi })).rejects.toSatisfy((err) => {
      return isYggdrasilHttpError(err) && err.status === 401;
    });
  });

  it('rejects when the user is not confirmed', async () => {
    const validate = vi.fn().mockResolvedValue(validatedToken(42));
    const findById = vi.fn().mockResolvedValue(userRow({ confirmed: false }));
    const strapi = buildStrapi({
      tokens: { validate },
      users: { findById },
    });
    const ctx = buildCtx({ authorization: 'Bearer good' });
    await expect(yggdrasilTokenAuth(ctx, undefined, { strapi })).rejects.toSatisfy((err) => {
      return isYggdrasilHttpError(err) && err.status === 401;
    });
  });

  it('attaches ctx.state.yggdrasilUser on success', async () => {
    const validate = vi.fn().mockResolvedValue(validatedToken(42));
    const findById = vi.fn().mockResolvedValue(userRow());
    const strapi = buildStrapi({
      tokens: { validate },
      users: { findById },
    });
    const ctx = buildCtx({ authorization: 'Bearer good' });
    await expect(yggdrasilTokenAuth(ctx, undefined, { strapi })).resolves.toBe(true);
    expect((ctx.state as { yggdrasilUser?: unknown }).yggdrasilUser).toEqual({
      id: 42,
      uuid: '00000000000000000000000000000042',
      username: 'steve',
    });
  });
});
