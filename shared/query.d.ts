export const PAGE_SIZES: readonly number[];
export const DEFAULT_PAGE_SIZE: number;

export class QueryError extends Error {}

export type QueryOp = 'eq' | 'neq' | 'in' | 'nin' | 'null';
export type QueryScalar = string | number | boolean;

export type QueryCond =
  | { field: string; op: 'eq' | 'neq'; value: QueryScalar }
  | { field: string; op: 'in' | 'nin'; value: QueryScalar[] }
  | { field: string; op: 'null'; value: boolean }
  | { or: QueryCond[] }
  | { and: QueryCond[] };

export interface QuerySort {
  field: string;
  dir?: 'asc' | 'desc';
  type?: 'text' | 'number';
}

export interface QuerySpec {
  where?: QueryCond[];
  search?: { text: string; fields: string[] } | null;
  sort?: QuerySort[];
  offset?: number;
  limit?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QueryRules {
  filterFields?: string[];
  searchFields?: string[];
  sortFields?: string[];
}

export function parsePath(field: string): string[];
export function getPath(item: unknown, field: string): unknown;
export function scalar(v: unknown): string | null;
export function clampPageSize(n: unknown, fallback?: number): number;
export function normalizeSearch(search: unknown): { text: string; fields: string[] } | null;
export function matchesCond(item: unknown, c: QueryCond): boolean;
export function compareItems(a: any, b: any, sort?: QuerySort[]): number;
export function runQuery<T>(items: T[], spec?: QuerySpec): { items: T[]; total: number };
export function totalPagesFor(total: number, pageSize: number): number;
export function runPage<T>(items: T[], spec: QuerySpec, page: number, pageSize: number): PageResult<T>;
export function validateSpec(raw: unknown, rules: QueryRules): QuerySpec;
