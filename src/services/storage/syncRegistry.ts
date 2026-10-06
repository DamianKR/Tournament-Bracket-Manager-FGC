/**
 * Offline Sync Registry
 *
 * Decoupled registry for per-collection "flush pending work" functions.
 * Each service registers a sync function; the reconnect hook in
 * localStorage.ts runs them all on 'online' — without localStorage.ts
 * needing to import every service (which would create circular imports:
 * duelService → participantService → localStorage).
 *
 * A sync function should:
 *   - re-push every locally-pending record/op the server never confirmed
 *   - return the number of items synced (optional, for logging)
 *   - swallow its own network errors (offline = nothing to do)
 *
 * RN migration: this module has no browser dependencies — the same
 * registry works once localStorage is swapped for AsyncStorage.
 */

export type OfflineSyncFn = () => Promise<number | void>;

const _syncs = new Set<OfflineSyncFn>();

export function registerOfflineSync(fn: OfflineSyncFn): void {
  _syncs.add(fn);
}

export function unregisterOfflineSync(fn: OfflineSyncFn): void {
  _syncs.delete(fn);
}

/** Runs every registered sync sequentially; one failure doesn't block the rest. */
export async function runOfflineSyncs(): Promise<number> {
  let total = 0;
  for (const fn of _syncs) {
    try {
      const n = await fn();
      if (typeof n === 'number') total += n;
    } catch (err) {
      console.warn('[Sync] Pending sync failed:', err);
    }
  }
  return total;
}
