import type { KoaContext } from '../types';

export type ListQuery = {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const positiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const parseListQuery = (ctx: KoaContext): ListQuery => {
  const page = positiveInteger(ctx.query.page, DEFAULT_PAGE);
  const pageSize = Math.min(positiveInteger(ctx.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const rawSearch = typeof ctx.query.search === 'string' ? ctx.query.search.trim() : '';
  return {
    page,
    pageSize,
    ...(rawSearch ? { search: rawSearch } : {}),
  };
};

export const buildPaginationMeta = (total: number, page: number, pageSize: number) => ({
  pagination: {
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  },
});
