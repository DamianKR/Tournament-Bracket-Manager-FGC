/**
 * serverStatus.ts — Observable "can we reach the API?" state.
 *
 * Pure module (zero imports). apiClient feeds it from the health check and the
 * browser online/offline events; UI hooks subscribe to it so pages can swap a
 * misleading "no data" message for "reconnect to load this".
 *
 *   unknown → nothing has been checked yet
 *   online  → last health check succeeded
 *   offline → last health check failed / the browser reported no network
 */

export type ServerStatus = 'unknown' | 'online' | 'offline';

let status: ServerStatus = 'unknown';
const listeners = new Set<() => void>();

export function getServerStatus(): ServerStatus {
  return status;
}

export function setServerStatus(next: ServerStatus): void {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

export function subscribeServerStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
