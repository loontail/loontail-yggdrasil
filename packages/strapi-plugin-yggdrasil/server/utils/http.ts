import type { KoaContext } from '../types';

export type ListQuery = {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
};

export const parseListQuery = (ctx: KoaContext): ListQuery => ({
  page: Number(ctx.query.page) || 1,
  pageSize: Number(ctx.query.pageSize) || 25,
  search: typeof ctx.query.search === 'string' ? ctx.query.search : undefined,
});

export const buildPaginationMeta = (total: number, page: number, pageSize: number) => ({
  pagination: {
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
    total,
  },
});
