/**
 * pagedClient.ts — One server page of a paginated list endpoint.
 *
 *   GET {path}?{params}&page=&pageSize=&q={"where":[..],"search":{..},"sort":[..]}
 *   → { items, total, page, pageSize, totalPages }   (server/utils/paginate.js)
 *
 * Throws PageUnavailableError whenever the data could not be had from the
 * server (offline, 5xx, network error, or an older backend that still answers
 * with a plain array) so callers fall back to the local mirror.
 */

import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';
import { setServerStatus } from '@/services/api/serverStatus';
import type { PageResult, QuerySpec } from '../../../shared/query.js';

export class PageUnavailableError extends Error {
  constructor(message = 'Server unavailable') {
    super(message);
    this.name = 'PageUnavailableError';
  }
}

/** A definitive 4xx answer (bad query, no access…): not a reason to use the mirror. */
export class PageHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'PageHttpError';
  }
}

export interface FetchPageArgs {
  path: string;
  params?: Record<string, string | undefined>;
  spec: QuerySpec;
  page: number;
  pageSize: number;
  init?: RequestInit;
}

/** Only what the server reads: offset/limit are derived from page/pageSize there. */
function serverSpec(spec: QuerySpec): string {
  const { where, search, sort } = spec;
  return JSON.stringify({ where, search: search?.text ? search : undefined, sort });
}

export function buildPageUrl({ path, params, spec, page, pageSize }: Omit<FetchPageArgs, 'init'>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== '') qs.set(k, v);
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  qs.set('q', serverSpec(spec));
  return `${SERVER_URL}${path}?${qs.toString()}`;
}

function isPageResult<T>(v: unknown): v is PageResult<T> {
  const r = v as PageResult<T> | null;
  return !!r && Array.isArray(r.items) && typeof r.total === 'number' && typeof r.page === 'number' && typeof r.totalPages === 'number';
}

export async function fetchServerPage<T>(a: FetchPageArgs): Promise<PageResult<T>> {
  if (!(await isServerAvailable())) throw new PageUnavailableError();
  let res: Response;
  try {
    res = await fetch(buildPageUrl(a), a.init);
  } catch (err) {
    console.error('[pagedClient] network error:', err);
    resetServerCache();
    setServerStatus('offline');
    throw new PageUnavailableError();
  }
  if (res.status >= 500) throw new PageUnavailableError(`HTTP ${res.status}`);
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new PageHttpError(res.status, msg ?? `HTTP ${res.status}`);
  }
  const body: unknown = await res.json();
  if (!isPageResult<T>(body)) throw new PageUnavailableError('Backend does not paginate this endpoint yet');
  return body;
}
