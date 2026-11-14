/**
 * pagedSource.ts — Where a paginated list gets its rows.
 *
 * A source = optional server pages + a local copy. The UI hook (usePaginatedList)
 * only talks to this interface, so the same pagination works for:
 *   - server-paginated lists with a lazily-filled mirror (createServerPagedSource)
 *   - lists whose authoritative copy is already local (omit fetchPage)
 */

import type { PageResult, QuerySpec } from '../../../shared/query.js';
import { fetchServerPage } from './pagedClient';
import type { ListMirror } from './listMirror';

export interface LocalRead<T> {
  items: T[];
  /** The copy holds every row of the scope → offline filter/search is exhaustive. */
  complete: boolean;
  /** When the copy was last refreshed (shown in "offline, last updated…" banners). */
  cachedAt?: string | null;
}

export interface PagedSource<T> {
  /** Stable id: keys the persisted page size. */
  id: string;
  /** Identity of the data scope (path + params): the UI hook reloads when this changes, not when the object does. */
  key?: string;
  /** Online page (filters/search/sort run in the server). Omit for local-only lists. */
  fetchPage?: (spec: QuerySpec, page: number, pageSize: number) => Promise<PageResult<T>>;
  readLocal: () => LocalRead<T> | null;
  /** Called with every server page so the local copy keeps growing. */
  mergeLocal?: (items: T[]) => void;
  /** Fill the rest of the local copy in the background (resolves when done or aborted). */
  completeLocal?: () => Promise<void>;
}

export interface ServerPagedSourceOptions<T extends { id: string }> {
  id: string;
  path: string;
  /** Scope params the server needs (communityId, participantId…). */
  params?: Record<string, string | undefined>;
  init?: () => RequestInit;
  mirror: ListMirror<T>;
  /** Rows per request while filling the mirror in the background. */
  chunk?: number;
  /** Safety cap: above this the mirror stays "incomplete" instead of growing unbounded. */
  maxMirror?: number;
  /** A complete mirror is re-downloaded in the background after this long. */
  refreshAfterMs?: number;
}

const inflight = new Map<string, Promise<void>>();

export function createServerPagedSource<T extends { id: string }>(o: ServerPagedSourceOptions<T>): PagedSource<T> {
  const chunk = o.chunk ?? 100;
  const maxMirror = o.maxMirror ?? 5000;
  const refreshAfterMs = o.refreshAfterMs ?? 10 * 60 * 1000;
  const scopeKey = `${o.id}|${o.path}|${JSON.stringify(o.params ?? {})}`;

  const fetchPage: NonNullable<PagedSource<T>['fetchPage']> = (spec, page, pageSize) =>
    fetchServerPage<T>({ path: o.path, params: o.params, spec, page, pageSize, init: o.init?.() });

  async function download(): Promise<void> {
    const all: T[] = [];
    let page = 1;
    for (;;) {
      const res = await fetchPage({}, page, chunk);
      all.push(...res.items);
      if (page >= res.totalPages) break;
      if (all.length >= maxMirror) {
        o.mirror.replace(all, false);
        return;
      }
      page++;
    }
    o.mirror.replace(all, true);
  }

  return {
    id: o.id,
    key: scopeKey,
    fetchPage,
    readLocal() {
      const m = o.mirror.read();
      return m ? { items: m.items, complete: m.complete, cachedAt: m.cachedAt } : null;
    },
    mergeLocal: (items) => o.mirror.merge(items),
    completeLocal() {
      const m = o.mirror.read();
      if (m?.complete && Date.now() - Date.parse(m.cachedAt) < refreshAfterMs) return Promise.resolve();
      const running = inflight.get(scopeKey);
      if (running) return running;
      const p = download()
        .catch(() => {})                       // offline / 4xx: stay with what we have
        .finally(() => inflight.delete(scopeKey));
      inflight.set(scopeKey, p);
      return p;
    },
  };
}

/**
 * Server pages with NO local copy: for data that must not be stored in the
 * browser (user accounts) — offline the list reports `unavailable`.
 */
export function createServerOnlyPagedSource<T extends { id: string }>(o: {
  id: string;
  path: string;
  params?: Record<string, string | undefined>;
  init?: () => RequestInit;
}): PagedSource<T> {
  return {
    id: o.id,
    key: `${o.id}|${o.path}|${JSON.stringify(o.params ?? {})}`,
    fetchPage: (spec, page, pageSize) => fetchServerPage<T>({ path: o.path, params: o.params, spec, page, pageSize, init: o.init?.() }),
    readLocal: () => null,
  };
}
