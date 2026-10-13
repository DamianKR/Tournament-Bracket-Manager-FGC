/**
 * mirrorStore.ts — Read-only mirrors of server data in localStorage.
 *
 * Pure storage module (zero imports → no circular deps). Each `store` is one
 * localStorage key holding a map of `key → { data, cachedAt }`. Used by
 * readThrough (server reads), the session cache and any sync-first renderer.
 *
 * Mirrors are best-effort: quota/parse errors never throw.
 */

export interface Mirrored<T> {
  data: T;
  cachedAt: string;
}

function readStore(store: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(store) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Entries written in another shape are treated as a miss. */
export function mirrorGet<T>(store: string, key: string): Mirrored<T> | null {
  const e = readStore(store)[key];
  if (!e || typeof e !== 'object' || !('data' in e)) return null;
  const m = e as Partial<Mirrored<T>>;
  return typeof m.cachedAt === 'string' ? (m as Mirrored<T>) : null;
}

export function mirrorPut<T>(store: string, key: string, data: T): void {
  try {
    const all = readStore(store);
    all[key] = { data, cachedAt: new Date().toISOString() } satisfies Mirrored<T>;
    localStorage.setItem(store, JSON.stringify(all));
  } catch {
    // Quota exceeded / storage unavailable — the mirror is best-effort.
  }
}

export function mirrorDel(store: string, key: string): void {
  try {
    const all = readStore(store);
    if (!(key in all)) return;
    delete all[key];
    localStorage.setItem(store, JSON.stringify(all));
  } catch {
    // ignore
  }
}
