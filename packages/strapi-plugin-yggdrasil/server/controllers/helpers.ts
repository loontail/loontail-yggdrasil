import type { ZodTypeAny, z } from 'zod';
import type { KoaContext } from '../types';

const HTTP_BAD_REQUEST = 400;

export { pluginService } from '../utils/strapi-runtime';

export const parseOrThrow = <S extends ZodTypeAny>(
  ctx: KoaContext,
  schema: S,
  input: unknown,
): z.infer<S> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    ctx.status = HTTP_BAD_REQUEST;
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new YggdrasilHttpError(HTTP_BAD_REQUEST, 'IllegalArgumentException', message);
  }
  return parsed.data;
};

export class YggdrasilHttpError extends Error {
  readonly status: number;
  readonly error: string;
  readonly errorCause: string | undefined;

  constructor(status: number, error: string, message: string, cause?: string) {
    super(message);
    this.name = 'YggdrasilHttpError';
    this.status = status;
    this.error = error;
    this.errorCause = cause;
  }
}

export const isYggdrasilHttpError = (value: unknown): value is YggdrasilHttpError =>
  value instanceof YggdrasilHttpError;
