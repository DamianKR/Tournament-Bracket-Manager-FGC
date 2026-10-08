/**
 * matchOpsQueue.ts — Ordered localStorage outbox for ELO-affecting writes.
 *
 * Pure storage module (zero imports → no circular deps). Used by:
 *   - rankingService.recordMatch          → POST /api/ranking/match
 *   - leagueService.reportMatchResult     → POST /api/leagues/:id/matches/:mid/report
 *   - leagueService.resolveLeagueMatch    → POST /api/leagues/:id/matches/:mid/resolve
 *   - matchmakingService.result/forfeit   → PUT  /api/matchmaking/assignments/:id/...
 *
 * Order is preserved strictly: later ELO depends on earlier ELO, so ops are
 * replayed FIFO and the first network failure halts the drain (remaining ops
 * stay queued for the next reconnect).
 *
 * The replay logic lives in localStorage.ts (syncPendingMatchOps) — it has
 * access to apiClient/authService without creating cycles.
 */

export interface QueuedMatchOp {
  /** Unique op id (also used for dedupe/debugging). */
  id: string;
  queuedAt: string;
  /** HTTP rejections seen so far — op is dropped after MAX_ATTEMPTS. */
  attempts: number;
  method: 'POST' | 'PUT';
  /** Path relative to SERVER_URL, e.g. '/api/ranking/match'. */
  path: string;
  body: Record<string, unknown>;
}

const KEY = 'bracket_pending_match_ops';

/** Max times an op may be retried after an HTTP-level rejection before dropping. */
export const MATCH_OP_MAX_ATTEMPTS = 3;

export function enqueueMatchOp(op: Omit<QueuedMatchOp, 'queuedAt' | 'attempts'>): QueuedMatchOp {
  const entry: QueuedMatchOp = {
    ...op,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  try {
    const all = readMatchOps();
    all.push(entry);
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  return entry;
}

export function readMatchOps(): QueuedMatchOp[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedMatchOp[];
  } catch {
    return [];
  }
}

export function writeMatchOps(ops: QueuedMatchOp[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {}
}

export function removeMatchOp(id: string): void {
  writeMatchOps(readMatchOps().filter((o) => o.id !== id));
}

/** Increments the attempt counter of an op (survives restarts). */
export function bumpMatchOpAttempts(id: string): QueuedMatchOp[] {
  const all = readMatchOps();
  const op = all.find((o) => o.id === id);
  if (op) op.attempts += 1;
  writeMatchOps(all);
  return all;
}

// ── Multi-tab sync lock ───────────────────────────────────────────────────
// Prevents two browser tabs from draining the queue simultaneously, which
// could lead to double ELO application on ops without server-side idempotency.

const LOCK_KEY = 'bracket_matchops_lock';
/** How long (ms) a lock is considered valid before it is treated as stale. */
const LOCK_TTL_MS = 30_000;

/**
 * Tries to acquire the drain lock.
 * Returns true if the lock was acquired (caller may proceed), false if another
 * tab already holds a fresh lock (caller should bail out).
 */
export function acquireMatchOpLock(): boolean {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { ts: number };
      if (Date.now() - parsed.ts < LOCK_TTL_MS) return false; // held by another tab
    }
    localStorage.setItem(LOCK_KEY, JSON.stringify({ ts: Date.now() }));
    return true;
  } catch {
    return true; // if storage is broken, allow the sync anyway
  }
}

/** Releases the drain lock. Safe to call even if the lock is not held. */
export function releaseMatchOpLock(): void {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {}
}
