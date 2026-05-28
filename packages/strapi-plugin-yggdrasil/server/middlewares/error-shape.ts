import type { Context, Next } from 'koa';
import { isYggdrasilHttpError } from '../controllers/helpers';

const HTTP_INTERNAL = 500;

const isYggdrasilRoute = (path: string): boolean => path.startsWith('/api/yggdrasil');

export default () => async (ctx: Context, next: Next) => {
  if (!isYggdrasilRoute(ctx.path)) {
    await next();
    return;
  }
  try {
    await next();
  } catch (err) {
    if (isYggdrasilHttpError(err)) {
      ctx.status = err.status;
      ctx.body = {
        error: err.error,
        errorMessage: err.message,
        ...(err.errorCause !== undefined ? { cause: err.errorCause } : {}),
      };
      return;
    }
    ctx.status = HTTP_INTERNAL;
    ctx.body = {
      error: 'InternalServerError',
      errorMessage: err instanceof Error ? err.message : 'Internal server error',
    };
    ctx.app.emit('error', err, ctx);
  }
};
