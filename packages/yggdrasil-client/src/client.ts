import {
  type GameProfile,
  GameProfileSchema,
  type SkinVariant,
  SkinVariants,
  type TexturesLookupResponse,
  TexturesLookupResponseSchema,
  YggdrasilEndpoints,
  type YggdrasilMeta,
  YggdrasilMetaSchema,
  type YggdrasilSession,
  YggdrasilSessionSchema,
  assertPngBuffer,
  undashUuid,
} from '@loontail/yggdrasil-core';
import { z } from 'zod';
import {
  YggdrasilClientError,
  YggdrasilClientErrorCodes,
  isYggdrasilClientErrorCode,
} from './errors/yggdrasil-client-error.js';
import { type Fetcher, deleteWithAuth, getJson, postJson, putMultipart } from './http.js';

export type YggdrasilClientOptions = {
  readonly apiRoot: string;
  readonly fetch?: Fetcher;
};

const AUTH_AGENT = { name: 'Minecraft', version: 1 } as const;
const BULK_PROFILES_MAX = 10;
const HTTP_FORBIDDEN = 403;

const GameProfileArraySchema = z.array(GameProfileSchema);

const signedQuery = (signed?: boolean): string => {
  if (signed === true) return '?unsigned=false';
  if (signed === false) return '?unsigned=true';
  return '';
};

export class YggdrasilClient {
  private readonly apiRoot: string;
  private readonly fetcher: Fetcher;

  constructor(options: YggdrasilClientOptions) {
    this.apiRoot = options.apiRoot.replace(/\/$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async authenticate(input: {
    username: string;
    password: string;
    clientToken?: string;
    requestUser?: boolean;
  }): Promise<YggdrasilSession> {
    return postJson({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.authenticate),
      body: {
        username: input.username,
        password: input.password,
        ...(input.clientToken ? { clientToken: input.clientToken } : {}),
        ...(input.requestUser ? { requestUser: input.requestUser } : {}),
        agent: AUTH_AGENT,
      },
      responseSchema: YggdrasilSessionSchema,
    });
  }

  async refresh(input: {
    accessToken: string;
    clientToken?: string;
    requestUser?: boolean;
  }): Promise<YggdrasilSession> {
    return postJson({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.refresh),
      body: {
        accessToken: input.accessToken,
        ...(input.clientToken ? { clientToken: input.clientToken } : {}),
        ...(input.requestUser ? { requestUser: input.requestUser } : {}),
      },
      responseSchema: YggdrasilSessionSchema,
    });
  }

  async validate(input: { accessToken: string; clientToken?: string }): Promise<boolean> {
    try {
      await postJson({
        fetcher: this.fetcher,
        url: this.url(YggdrasilEndpoints.validate),
        body: {
          accessToken: input.accessToken,
          ...(input.clientToken ? { clientToken: input.clientToken } : {}),
        },
        responseSchema: null,
      });
      return true;
    } catch (err) {
      if (
        isYggdrasilClientErrorCode(err, YggdrasilClientErrorCodes.HTTP_ERROR) &&
        err.context?.status === HTTP_FORBIDDEN
      ) {
        return false;
      }
      throw err;
    }
  }

  async invalidate(input: { accessToken: string; clientToken?: string }): Promise<void> {
    await postJson({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.invalidate),
      body: {
        accessToken: input.accessToken,
        ...(input.clientToken ? { clientToken: input.clientToken } : {}),
      },
      responseSchema: null,
    });
  }

  async profile(uuid: string, opts?: { signed?: boolean }): Promise<GameProfile> {
    const undashed = undashUuid(uuid);
    const query = signedQuery(opts?.signed);
    return getJson({
      fetcher: this.fetcher,
      url: `${this.url(YggdrasilEndpoints.sessionProfile)}/${undashed}${query}`,
      responseSchema: GameProfileSchema,
    });
  }

  async bulkProfiles(names: readonly string[]): Promise<GameProfile[]> {
    if (names.length > BULK_PROFILES_MAX) {
      throw new YggdrasilClientError(
        YggdrasilClientErrorCodes.INVALID_REQUEST,
        `bulkProfiles accepts at most ${BULK_PROFILES_MAX} names per request (got ${names.length})`,
        { context: { count: names.length, url: this.url(YggdrasilEndpoints.bulkProfiles) } },
      );
    }
    return postJson({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.bulkProfiles),
      body: names,
      responseSchema: GameProfileArraySchema,
    });
  }

  async meta(): Promise<YggdrasilMeta> {
    return getJson({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.root),
      responseSchema: YggdrasilMetaSchema,
    });
  }

  async getTextures(uuid: string): Promise<TexturesLookupResponse> {
    const undashed = undashUuid(uuid);
    return getJson({
      fetcher: this.fetcher,
      url: `${this.url(YggdrasilEndpoints.textures)}/${undashed}`,
      responseSchema: TexturesLookupResponseSchema,
    });
  }

  async uploadSkin(input: {
    accessToken: string;
    file: Uint8Array | ArrayBuffer;
    variant?: SkinVariant;
  }): Promise<void> {
    assertPngBuffer(input.file, 'skin');
    await putMultipart({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.texturesSkin),
      accessToken: input.accessToken,
      file: input.file,
      fields: { variant: input.variant ?? SkinVariants.CLASSIC },
      responseSchema: null,
    });
  }

  async uploadCape(input: {
    accessToken: string;
    file: Uint8Array | ArrayBuffer;
  }): Promise<void> {
    assertPngBuffer(input.file, 'cape');
    await putMultipart({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.texturesCape),
      accessToken: input.accessToken,
      file: input.file,
      responseSchema: null,
    });
  }

  async deleteSkin(input: { accessToken: string }): Promise<void> {
    await deleteWithAuth({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.texturesSkin),
      accessToken: input.accessToken,
      responseSchema: null,
    });
  }

  async deleteCape(input: { accessToken: string }): Promise<void> {
    await deleteWithAuth({
      fetcher: this.fetcher,
      url: this.url(YggdrasilEndpoints.texturesCape),
      accessToken: input.accessToken,
      responseSchema: null,
    });
  }

  private url(endpoint: string): string {
    return `${this.apiRoot}${endpoint}`;
  }
}
