/**
 * listMirror.ts — Local copy of a server list that is filled page by page.
 *
 * Built on mirrorStore (one localStorage key per `store`, one entry per `key`).
 * `complete` says whether the copy holds EVERY row of the scope; only then can
 * offline filtering/searching be trusted to be exhaustive.
 */

import { mirrorGet, mirrorPut, mirrorDel } from '@/services/storage/mirrorStore';

export interface ListMirrorData<T> {
  items: T[];
  complete: boolean;
}

export interface ListMirror<T> {
  read(): (ListMirrorData<T> & { cachedAt: string }) | null;
  /** Upsert rows by id (pages fetched on demand); keeps the `complete` flag. */
  merge(items: T[]): void;
  /** Replace the whole copy (background completion finished or was capped). */
  replace(items: T[], complete: boolean): void;
  /** Drop rows deleted elsewhere (keeps the `complete` flag). */
  remove(ids: string[]): void;
  clear(): void;
}

export function createListMirror<T extends { id: string }>(store: string, key: string): ListMirror<T> {
  const read = () => {
    const m = mirrorGet<ListMirrorData<T>>(store, key);
    return m && Array.isArray(m.data?.items) ? { ...m.data, cachedAt: m.cachedAt } : null;
  };
  return {
    read,
    merge(items) {
      if (!items.length) return;
      const cur = read();
      const byId = new Map((cur?.items ?? []).map((i) => [i.id, i]));
      for (const i of items) byId.set(i.id, i);
      mirrorPut<ListMirrorData<T>>(store, key, { items: [...byId.values()], complete: cur?.complete ?? false });
    },
    replace(items, complete) {
      mirrorPut<ListMirrorData<T>>(store, key, { items, complete });
    },
    remove(ids) {
      const cur = read();
      if (!cur || !ids.length) return;
      const drop = new Set(ids);
      mirrorPut<ListMirrorData<T>>(store, key, { items: cur.items.filter((i) => !drop.has(i.id)), complete: cur.complete });
    },
    clear: () => mirrorDel(store, key),
  };
}
