/**
 * readThrough.ts — Stale-while-revalidate reads for server-authoritative data.
 *
 * GET from the server when reachable and mirror the result (mirrorStore);
 * when offline or on a 5xx, serve the last mirror. Writes are NOT handled
 * here — they go through the outboxes (matchOpsQueue, duel ops, ...).
 *
 *   fresh        → server answered
 *   cached       → server unreachable / any non-OK answer, last mirror served
 *   gone         → opt-in via `goneStatuses` AND a genuine API answer (JSON
 *                  `{ error }`): the resource was removed or is off-limits
 *                  (mirror dropped). The generic "Route not found" 404 or a
 *                  proxy's HTML 404 never counts as gone.
 *   unavailable  → server unreachable and nothing mirrored yet
 */

import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';
import { mirrorGet, mirrorPut, mirrorDel } from './mirrorStore';

export type ReadResult<T> =
  | { status: 'fresh' | 'cached'; data: T; cachedAt: string | null }
  | { status: 'gone' | 'unavailable' };

export interface ReadThroughOptions<T> {
  /** Path relative to SERVER_URL, query string included. */
  path: string;
  store: string;
  key: string;
  label: string;
  init?: RequestInit;
  /** Statuses that mean "this specific resource is gone / off-limits". */
  goneStatuses?: number[];
  /** Transform applied to the data before it is mirrored (not to the return). */
  prepare?: (data: T) => T;
}

/**
 * True only for a genuine answer from our API about this resource: a JSON
 * `{ error }` body that is not the catch-all "Route not found". A proxy's HTML
 * 404 page or an unknown route (frontend deployed before backend) is not.
 */
async function isGenuineGone(res: Response): Promise<boolean> {
  try {
    const error = ((await res.clone().json()) as { error?: unknown })?.error;
    return typeof error === 'string' && error !== 'Route not found';
  } catch {
    return false;
  }
}

export async function readThrough<T>(o: ReadThroughOptions<T>): Promise<ReadResult<T>> {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${SERVER_URL}${o.path}`, o.init);
      if (res.ok) {
        const data = (await res.json()) as T;
        mirrorPut(o.store, o.key, o.prepare ? o.prepare(data) : data);
        return { status: 'fresh', data, cachedAt: null };
      }
      if (o.goneStatuses?.includes(res.status) && (await isGenuineGone(res))) {
        mirrorDel(o.store, o.key);
        return { status: 'gone' };
      }
      console.error(`[readThrough] ${o.label} failed (${res.status})`);
    } catch (err) {
      console.error(`[readThrough] ${o.label} error:`, err);
      resetServerCache();
    }
  }
  const m = mirrorGet<T>(o.store, o.key);
  return m ? { status: 'cached', data: m.data, cachedAt: m.cachedAt } : { status: 'unavailable' };
}

/** `data` when the read produced any, otherwise `fallback`. */
export function dataOr<T>(r: ReadResult<T>, fallback: T): T {
  return 'data' in r ? r.data : fallback;
}
