import { type YggdrasilErrorBody, YggdrasilErrorBodySchema } from '@loontail/yggdrasil-core';
import type { ZodTypeAny, z } from 'zod';
import {
  YggdrasilClientError,
  YggdrasilClientErrorCodes,
} from './errors/yggdrasil-client-error.js';

export type Fetcher = typeof fetch;

const isYggdrasilErrorBody = (body: unknown): body is YggdrasilErrorBody =>
  YggdrasilErrorBodySchema.safeParse(body).success;

const runFetch = async (url: string, op: () => Promise<Response>): Promise<Response> => {
  try {
    return await op();
  } catch (err) {
    throw new YggdrasilClientError(
      YggdrasilClientErrorCodes.NETWORK,
      `Network request failed: ${url}`,
      { cause: err, context: { url } },
    );
  }
};

export const postJson = async <S extends ZodTypeAny | null>(opts: {
  fetcher: Fetcher;
  url: string;
  body: unknown;
  responseSchema: S;
}): Promise<S extends ZodTypeAny ? z.infer<S> : void> => {
  const response = await runFetch(opts.url, () =>
    opts.fetcher(opts.url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(opts.body),
    }),
  );
  return handleResponse(response, opts.url, opts.responseSchema);
};

export const getJson = async <S extends ZodTypeAny>(opts: {
  fetcher: Fetcher;
  url: string;
  responseSchema: S;
}): Promise<z.infer<S>> => {
  const response = await runFetch(opts.url, () =>
    opts.fetcher(opts.url, { method: 'GET', headers: { accept: 'application/json' } }),
  );
  return handleResponse(response, opts.url, opts.responseSchema);
};

export const putMultipart = async <S extends ZodTypeAny | null>(opts: {
  fetcher: Fetcher;
  url: string;
  accessToken: string;
  file: Uint8Array | ArrayBuffer;
  fields?: Readonly<Record<string, string>>;
  responseSchema: S;
}): Promise<S extends ZodTypeAny ? z.infer<S> : void> => {
  const form = new FormData();
  const view = opts.file instanceof Uint8Array ? opts.file : new Uint8Array(opts.file);
  // fetch sets the multipart boundary itself when given FormData — don't override Content-Type.
  // The .slice() detaches the view so the Blob works on both undici (Node) and the browser.
  const blob = new Blob([view.slice().buffer], { type: 'image/png' });
  form.append('file', blob, 'asset.png');
  if (opts.fields) {
    for (const [k, v] of Object.entries(opts.fields)) form.append(k, v);
  }
  const response = await runFetch(opts.url, () =>
    opts.fetcher(opts.url, {
      method: 'PUT',
      headers: { accept: 'application/json', authorization: `Bearer ${opts.accessToken}` },
      body: form,
    }),
  );
  return handleResponse(response, opts.url, opts.responseSchema);
};

export const deleteWithAuth = async <S extends ZodTypeAny | null>(opts: {
  fetcher: Fetcher;
  url: string;
  accessToken: string;
  responseSchema: S;
}): Promise<S extends ZodTypeAny ? z.infer<S> : void> => {
  const response = await runFetch(opts.url, () =>
    opts.fetcher(opts.url, {
      method: 'DELETE',
      headers: { accept: 'application/json', authorization: `Bearer ${opts.accessToken}` },
    }),
  );
  return handleResponse(response, opts.url, opts.responseSchema);
};

const handleResponse = async <S extends ZodTypeAny | null>(
  response: Response,
  url: string,
  schema: S,
): Promise<S extends ZodTypeAny ? z.infer<S> : void> => {
  if (!response.ok) {
    const body = await readJsonSafe(response);
    throw new YggdrasilClientError(
      YggdrasilClientErrorCodes.HTTP_ERROR,
      `Yggdrasil request failed: ${response.status} ${url}`,
      {
        context: {
          status: response.status,
          url,
          ...(isYggdrasilErrorBody(body) ? { body } : {}),
        },
      },
    );
  }
  if (schema === null) {
    return undefined as S extends ZodTypeAny ? z.infer<S> : undefined;
  }
  const raw = await readJsonSafe(response);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new YggdrasilClientError(
      YggdrasilClientErrorCodes.INVALID_RESPONSE,
      `Yggdrasil response failed schema validation: ${url}`,
      { context: { url, status: response.status }, cause: parsed.error },
    );
  }
  return parsed.data as S extends ZodTypeAny ? z.infer<S> : undefined;
};

const readJsonSafe = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
