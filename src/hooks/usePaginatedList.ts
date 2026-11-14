/**
 * usePaginatedList — the one pagination core for the whole site.
 *
 * Drives <Pagination/>: page + page size state, filter/search aware, with
 *   - usePaginatedList  → server pages (filters/search/sort run in the DB when
 *                         online) over a lazily-filled local mirror, falling
 *                         back to that mirror offline.
 *   - useLocalPagination→ same state/shape for lists that are already local.
 *
 * Pagination resets to page 1 whenever the filters/search/sort change, and
 * <Pagination/> hides itself when the filtered total fits in one page, so
 * "300 rows, filter leaves 20" shows no pagination, as expected.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PAGE_SIZE, clampPageSize, runPage } from '../../shared/query.js';
import type { PageResult, QuerySpec } from '../../shared/query.js';
import { getServerStatus } from '@/services/api/serverStatus';
import { PageUnavailableError } from '@/services/pagination/pagedClient';
import type { LocalRead, PagedSource } from '@/services/pagination/pagedSource';
import type { PaginationProps } from '@/components/Pagination/Pagination';
import { useOnReconnect } from './useServerStatus';

const SIZE_KEY = 'bracket_page_sizes';

function loadSize(listId: string, fallback: number): number {
  try {
    return clampPageSize((JSON.parse(localStorage.getItem(SIZE_KEY) ?? '{}') as Record<string, number>)[listId], fallback);
  } catch {
    return fallback;
  }
}

function saveSize(listId: string, size: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(SIZE_KEY) ?? '{}') as Record<string, number>;
    localStorage.setItem(SIZE_KEY, JSON.stringify({ ...all, [listId]: size }));
  } catch {
    // best-effort preference
  }
}

function useDebounced<V>(value: V, ms: number): V {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Page + page size, with the page snapping back to 1 when `resetKey` changes. */
function usePagingState(listId: string, resetKey: string, defaultPageSize: number) {
  const [pageSize, setSize] = useState(() => loadSize(listId, defaultPageSize));
  const [pg, setPg] = useState({ key: resetKey, page: 1 });
  // New filters/search/sort → back to page 1 FOR GOOD (derived-state reset during render), so
  // returning to an earlier filter state later does not bring its old page back.
  if (pg.key !== resetKey) setPg({ key: resetKey, page: 1 });
  const page = pg.key === resetKey ? pg.page : 1;
  const setPage = useCallback((p: number) => setPg({ key: resetKey, page: Math.max(1, Math.floor(p) || 1) }), [resetKey]);
  const setPageSize = useCallback(
    (n: number) => {
      const v = clampPageSize(n, defaultPageSize);
      saveSize(listId, v);
      setSize(v);
      setPg({ key: resetKey, page: 1 });
    },
    [listId, resetKey, defaultPageSize]
  );
  return { page, pageSize, setPage, setPageSize };
}

/** Search text is debounced; every other part of the spec applies immediately. */
function useEffectiveSpec(spec: QuerySpec, debounceMs: number): { spec: QuerySpec; key: string } {
  const text = useDebounced(spec.search?.text ?? '', debounceMs);
  const fields = JSON.stringify(spec.search?.fields ?? []);
  const rest = JSON.stringify({ where: spec.where, sort: spec.sort });
  return useMemo(() => {
    const eff: QuerySpec = {
      where: spec.where,
      sort: spec.sort,
      search: text.trim() ? { text, fields: JSON.parse(fields) as string[] } : null,
    };
    return { spec: eff, key: JSON.stringify(eff) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest, text, fields]);
}

export type ListOrigin = 'server' | 'local';

export interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
  /** Nothing to show yet (first load). */
  loading: boolean;
  /** A request is in flight (items on screen may be the previous ones). */
  fetching: boolean;
  /** Where the rows on screen came from. */
  from: ListOrigin | null;
  /** Rows come from a local copy that does not hold everything. */
  incomplete: boolean;
  /** Age of the local copy while it is what's on screen (null for server rows). */
  cachedAt: string | null;
  /** Server unreachable and nothing saved locally. */
  unavailable: boolean;
  error: string | null;
  reload: () => void;
  paginationProps: PaginationProps;
}

interface Shown<T> extends PageResult<T> {
  from: ListOrigin;
  incomplete: boolean;
  cachedAt: string | null;
}

export interface PaginatedListOptions<T extends { id: string }> {
  /** null = not ready yet. Reloads when its `key` (scope) changes, not on object identity. */
  source: PagedSource<T> | null;
  /** where / sort / search (text + fields). offset/limit are ignored. */
  spec: QuerySpec;
  /** 25 normally; 50 for ranking / participants. */
  defaultPageSize?: number;
  debounceMs?: number;
}

export function usePaginatedList<T extends { id: string }>(o: PaginatedListOptions<T>): PaginatedList<T> {
  // The effect keys on the source's scope, so a source rebuilt every render cannot loop.
  const sourceRef = useRef(o.source);
  sourceRef.current = o.source;
  const listId = o.source?.id ?? 'none';
  const sourceKey = o.source ? o.source.key ?? o.source.id : '';
  const { spec, key: specKey } = useEffectiveSpec(o.spec, o.debounceMs ?? 250);
  const { page, pageSize, setPage, setPageSize } = usePagingState(listId, specKey, o.defaultPageSize ?? DEFAULT_PAGE_SIZE);

  const [shown, setShown] = useState<Shown<T> | null>(null);
  const [fetching, setFetching] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reqRef = useRef(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useOnReconnect(reload);

  useEffect(() => {
    const req = ++reqRef.current;
    const stale = () => req !== reqRef.current;
    const source = sourceRef.current;
    if (!source) {
      setShown(null);
      setFetching(false);
      return;
    }

    const showLocal = (l: LocalRead<T>) => {
      const r = runPage(l.items, spec, page, pageSize);
      setShown({ ...r, from: 'local', incomplete: !l.complete, cachedAt: l.cachedAt ?? null });
      setUnavailable(false);
      if (r.page !== page) setPage(r.page);
    };

    const local = source.readLocal();
    if (!source.fetchPage) {
      if (local) showLocal({ items: local.items, complete: true });
      else setShown(null);
      setFetching(false);
      return;
    }

    setError(null);
    setFetching(true);
    // Cache-first: a complete copy paints instantly; a partial one only when we already know we're offline.
    if (local && (local.complete || getServerStatus() === 'offline')) showLocal(local);

    source
      .fetchPage(spec, page, pageSize)
      .then((res) => {
        if (stale()) return;
        setShown({ ...res, from: 'server', incomplete: false, cachedAt: null });
        setUnavailable(false);
        if (res.page !== page) setPage(res.page);
        source.mergeLocal?.(res.items);
        void source.completeLocal?.();
      })
      .catch((e: unknown) => {
        if (stale()) return;
        if (e instanceof PageUnavailableError) {
          const l = source.readLocal();
          if (l) showLocal(l);
          else {
            setShown(null);
            setUnavailable(true);
          }
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!stale()) setFetching(false);
      });
    // `setPage` is stable per specKey; page/pageSize/specKey drive the reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, specKey, page, pageSize, tick]);

  const total = shown?.total ?? 0;
  const totalPages = shown?.totalPages ?? 1;
  return {
    items: shown?.items ?? [],
    total,
    page: shown?.page ?? page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    loading: !shown && !unavailable && !error,
    fetching,
    from: shown?.from ?? null,
    incomplete: shown?.incomplete ?? false,
    cachedAt: shown?.cachedAt ?? null,
    unavailable,
    error,
    reload,
    paginationProps: { page: shown?.page ?? page, totalPages, total, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize, busy: fetching },
  };
}

/** Same state and shape for a list that is already in memory (filters/search/sort run locally). */
export function useLocalPagination<T extends { id: string }>(
  items: T[],
  spec: QuerySpec,
  /** `resetKey`: anything else that should send the list back to page 1 (e.g. a filter applied before pagination). */
  o: { listId: string; defaultPageSize?: number; debounceMs?: number; resetKey?: string }
): PaginatedList<T> {
  const { spec: eff, key: specKey } = useEffectiveSpec(spec, o.debounceMs ?? 250);
  const { page, pageSize, setPage, setPageSize } = usePagingState(o.listId, o.resetKey ? `${specKey}|${o.resetKey}` : specKey, o.defaultPageSize ?? DEFAULT_PAGE_SIZE);
  const r = useMemo(() => runPage(items, eff, page, pageSize), [items, eff, page, pageSize]);
  return {
    items: r.items,
    total: r.total,
    page: r.page,
    pageSize,
    totalPages: r.totalPages,
    setPage,
    setPageSize,
    loading: false,
    fetching: false,
    from: 'local',
    incomplete: false,
    cachedAt: null,
    unavailable: false,
    error: null,
    reload: () => {},
    paginationProps: { page: r.page, totalPages: r.totalPages, total: r.total, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize },
  };
}
