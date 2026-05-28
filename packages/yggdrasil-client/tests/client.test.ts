import { describe, expect, it, vi } from 'vitest';
import {
  YggdrasilClient,
  YggdrasilClientError,
  YggdrasilClientErrorCodes,
  buildAuthlibInjectorJvmArg,
} from '../src/index.js';

const PROFILE = {
  id: 'aabbccddeeff00112233445566778899',
  name: 'Steve',
};

const SESSION = {
  accessToken: 'a'.repeat(64),
  clientToken: 'c'.repeat(64),
  availableProfiles: [PROFILE],
  selectedProfile: PROFILE,
};

const okJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const noBodyResponse = (status: number): Response => new Response(null, { status });

describe('YggdrasilClient', () => {
  it('authenticate posts username/password+agent and returns the parsed session', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => okJsonResponse(SESSION));
    const client = new YggdrasilClient({
      apiRoot: 'https://example.test/api/yggdrasil',
      fetch: fetcher,
    });
    const session = await client.authenticate({ username: 'u', password: 'p' });
    expect(session).toEqual(SESSION);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/api/yggdrasil/authserver/authenticate',
      expect.objectContaining({ method: 'POST' }),
    );
    const firstCall = fetcher.mock.calls[0];
    if (!firstCall) throw new Error('fetcher was not called');
    const init = firstCall[1];
    if (!init) throw new Error('fetcher init missing');
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      username: 'u',
      password: 'p',
      agent: { name: 'Minecraft', version: 1 },
    });
  });

  it('validate returns true on 204 and false on 403', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(noBodyResponse(204))
      .mockResolvedValueOnce(
        okJsonResponse({ error: 'ForbiddenOperationException', errorMessage: 'no' }, 403),
      );
    const client = new YggdrasilClient({
      apiRoot: 'https://example.test/api/yggdrasil',
      fetch: fetcher,
    });
    expect(await client.validate({ accessToken: 't' })).toBe(true);
    expect(await client.validate({ accessToken: 't' })).toBe(false);
  });

  it('profile undashes a dashed UUID and parses the response', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => okJsonResponse(PROFILE));
    const client = new YggdrasilClient({
      apiRoot: 'https://example.test/api/yggdrasil',
      fetch: fetcher,
    });
    const result = await client.profile('aabbccdd-eeff-0011-2233-445566778899', { signed: true });
    expect(result).toEqual(PROFILE);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/api/yggdrasil/sessionserver/session/minecraft/profile/aabbccddeeff00112233445566778899?unsigned=false',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('profile sends unsigned=true when signed is explicitly false', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => okJsonResponse(PROFILE));
    const client = new YggdrasilClient({
      apiRoot: 'https://example.test/api/yggdrasil',
      fetch: fetcher,
    });
    await client.profile('aabbccddeeff00112233445566778899', { signed: false });
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/api/yggdrasil/sessionserver/session/minecraft/profile/aabbccddeeff00112233445566778899?unsigned=true',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects with INVALID_RESPONSE when the body fails schema validation', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => okJsonResponse({ id: 'not-hex', name: 'X' }));
    const client = new YggdrasilClient({
      apiRoot: 'https://example.test/api/yggdrasil',
      fetch: fetcher,
    });
    await expect(client.profile('aabbccddeeff00112233445566778899')).rejects.toMatchObject({
      code: YggdrasilClientErrorCodes.INVALID_RESPONSE,
    });
  });

  it('wraps network failures under YggdrasilClientErrorCodes.NETWORK', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('connect failed');
    });
    const client = new YggdrasilClient({
      apiRoot: 'https://example.test/api/yggdrasil',
      fetch: fetcher,
    });
    await expect(client.authenticate({ username: 'u', password: 'p' })).rejects.toBeInstanceOf(
      YggdrasilClientError,
    );
  });
});

describe('buildAuthlibInjectorJvmArg', () => {
  it('produces the canonical -javaagent string', () => {
    const arg = buildAuthlibInjectorJvmArg({
      jarPath: '/opt/x/authlib-injector-1.2.5.jar',
      apiRoot: 'https://example.test/api/yggdrasil',
    });
    expect(arg).toBe(
      '-javaagent:/opt/x/authlib-injector-1.2.5.jar=https://example.test/api/yggdrasil',
    );
  });
});

describe('bulkProfiles input validation', () => {
  it('rejects >10 names client-side with INVALID_REQUEST', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new YggdrasilClient({
      apiRoot: 'https://example.test/api/yggdrasil',
      fetch: fetcher,
    });
    const names = Array.from({ length: 11 }, (_, i) => `name${i}`);
    await expect(client.bulkProfiles(names)).rejects.toMatchObject({
      code: YggdrasilClientErrorCodes.INVALID_REQUEST,
      context: { count: 11 },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends 10 names through without complaining', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => okJsonResponse([]));
    const client = new YggdrasilClient({
      apiRoot: 'https://example.test/api/yggdrasil',
      fetch: fetcher,
    });
    const names = Array.from({ length: 10 }, (_, i) => `name${i}`);
    await client.bulkProfiles(names);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
