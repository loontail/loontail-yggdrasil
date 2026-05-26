/**
 * Internal types shared across the plugin's server-side modules.
 * Strapi v5's TypeScript surface is intentionally narrow here — we
 * model what we need rather than depend on `@strapi/types` (which
 * pulls a large transitive tree).
 */

import type { Context as KoaCtx } from 'koa';

/** Minimal slice of `@strapi/strapi`'s `Strapi` instance that we use. */
export type StrapiInstance = {
  readonly log: {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
  };
  readonly dirs: {
    readonly app: {
      readonly root: string;
      readonly src: string;
    };
    readonly static?: {
      readonly public: string;
    };
  };
  readonly config: {
    get(path: string, defaultValue?: unknown): unknown;
  };
  readonly db: {
    readonly connection: KnexLike;
    query(uid: string): {
      findOne(args: unknown): Promise<unknown>;
      findMany(args: unknown): Promise<unknown[]>;
      create(args: unknown): Promise<unknown>;
      update(args: unknown): Promise<unknown>;
      delete(args: unknown): Promise<unknown>;
      count(args: unknown): Promise<number>;
    };
  };
  plugin(name: string): {
    service(name: string): unknown;
    config(path?: string, defaultValue?: unknown): unknown;
  };
};

/**
 * Loose Knex-like shape — just what `bootstrap.ts` and a few services
 * call. We intentionally avoid pulling Knex types in directly to keep
 * `peerDependencies` slim.
 */
export type KnexLike = {
  schema: {
    hasTable(table: string): Promise<boolean>;
    hasColumn(table: string, column: string): Promise<boolean>;
    createTable(table: string, callback: (t: KnexTableBuilder) => void): Promise<unknown>;
    alterTable(table: string, callback: (t: KnexTableBuilder) => void): Promise<unknown>;
    dropTable(table: string): Promise<unknown>;
    dropTableIfExists(table: string): Promise<unknown>;
  };
  /** Dialect-agnostic SQL function builders (e.g. `knex.fn.now()`). */
  readonly fn: {
    now(): unknown;
  };
  raw(sql: string, bindings?: unknown[]): Promise<unknown>;
  transaction<T>(work: (trx: KnexLike) => Promise<T>): Promise<T>;
  (tableName: string): KnexQueryBuilder;
};

export type KnexTableBuilder = {
  string(column: string, length?: number): KnexColumnBuilder;
  integer(column: string): KnexColumnBuilder;
  timestamp(column: string, options?: { useTz?: boolean }): KnexColumnBuilder;
  dropColumn(column: string): void;
  primary(columns: string | string[]): KnexColumnBuilder;
};

export type KnexColumnBuilder = {
  nullable(): KnexColumnBuilder;
  notNullable(): KnexColumnBuilder;
  unique(): KnexColumnBuilder;
  defaultTo(value: unknown): KnexColumnBuilder;
  index(): KnexColumnBuilder;
  primary(): KnexColumnBuilder;
};

/**
 * Knex query builders are thenable themselves — awaiting one executes
 * the query. Modelled as `PromiseLike<unknown>` so generic `await
 * qb.delete()` works without a separate `.then(...)` cast.
 */
export type KnexQueryBuilder = PromiseLike<unknown> & {
  where(criteria: Record<string, unknown>): KnexQueryBuilder;
  where(column: string, operator: string, value: unknown): KnexQueryBuilder;
  whereNull(column: string): KnexQueryBuilder;
  whereRaw(sql: string, bindings?: unknown[]): KnexQueryBuilder;
  select(...columns: string[]): Promise<unknown[]>;
  first(...columns: string[]): Promise<unknown>;
  update(values: Record<string, unknown>): KnexQueryBuilder;
  insert(values: Record<string, unknown> | Record<string, unknown>[]): KnexQueryBuilder;
  delete(): KnexQueryBuilder;
  returning(columns: string | string[]): Promise<Record<string, unknown>[]>;
  orderBy(column: string, dir?: 'asc' | 'desc'): KnexQueryBuilder;
  limit(n: number): KnexQueryBuilder;
};

export type KoaContext = KoaCtx & {
  request: KoaCtx['request'] & {
    body?: unknown;
  };
  params: Record<string, string>;
  badRequest: (message: string, body?: unknown) => unknown;
  forbidden: (message: string, body?: unknown) => unknown;
  notFound: (message?: string, body?: unknown) => unknown;
  unauthorized: (message: string, body?: unknown) => unknown;
};
