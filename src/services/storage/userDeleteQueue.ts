/**
 * userDeleteQueue.ts
 *
 * Tiny localStorage outbox for superadmin user-account deletions performed
 * while offline. Kept in its own file to avoid circular-import issues between
 * localStorage.ts (which imports from authService.ts) and authService.ts.
 *
 * Usage:
 *   queueUserDelete(userId)          — called by authService when offline
 *   readQueuedUserDeletes()          — called by syncPendingUserDeletes
 *   removeQueuedUserDelete(userId)   — called after successful server replay
 */

const KEY = 'bracket_pending_user_deletes';

export function queueUserDelete(userId: string): void {
  try {
    const ids: string[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!ids.includes(userId)) {
      ids.push(userId);
      localStorage.setItem(KEY, JSON.stringify(ids));
    }
  } catch {}
}

export function readQueuedUserDeletes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch { return []; }
}

export function removeQueuedUserDelete(userId: string): void {
  try {
    const ids: string[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    localStorage.setItem(KEY, JSON.stringify(ids.filter(id => id !== userId)));
  } catch {}
}
