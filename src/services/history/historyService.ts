/**
 * historyService.ts — Unified match history (tournament + league + ranked).
 *
 * One paginated feed served by GET /api/history (see server/utils/historyQuery.js).
 * Rows are flat; the original record rides along under `data`. The browser keeps
 * the very same rows per community, so Events → History and a participant's
 * Matches tab share one local copy and run the same filters offline.
 */

import { getAuthHeader } from '@/services/auth/authService';
import { createListMirror } from '@/services/pagination/listMirror';
import { createServerPagedSource } from '@/services/pagination/pagedSource';
import type { PagedSource } from '@/services/pagination/pagedSource';
import { readThrough } from '@/services/storage/readThrough';
import type { QueryCond, QuerySpec } from '../../../shared/query.js';

export type HistoryType = 'tournament' | 'league' | 'duel' | 'matchmaking' | 'free';
export const HISTORY_TYPES: HistoryType[] = ['tournament', 'league', 'duel', 'matchmaking', 'free'];

export interface HistoryRow {
  id: string;
  kind: 'tournament' | 'league' | 'ranked';
  type: HistoryType;
  gameId: string | null;
  p1: string | null;
  p2: string | null;
  winnerId: string | null;
  date: string | null;
  /** The original tournament / league / ranked match record. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

const HISTORY_STORE = 'bracket_history_rows';
const COUNTS_STORE = 'bracket_history_counts';

export function historyMirror(communityId: string) {
  return createListMirror<HistoryRow>(HISTORY_STORE, communityId);
}

/** `listId` only keys the remembered page size (each screen keeps its own). */
export function createHistorySource(communityId: string, listId: string): PagedSource<HistoryRow> {
  return createServerPagedSource<HistoryRow>({
    id: listId,
    path: '/api/history',
    params: { communityId },
    init: () => ({ headers: { ...getAuthHeader() } }),
    mirror: historyMirror(communityId),
  });
}

export interface HistoryFilters {
  type: HistoryType | 'all';
  /** A chosen game; null = every enabled game (plus untagged legacy rows). */
  gameId: string | null;
  enabledGameIds: string[];
  /** Match types hidden because the community turned that module off. */
  disabledTypes: HistoryType[];
  /** Either side of the match. */
  playerId?: string | null;
  /** Only matches this participant won / did not win. */
  resultFor?: { participantId: string; result: 'wins' | 'losses' } | null;
}

/** The History / profile-Matches filters as one query (DB online, local copy offline). */
export function buildHistorySpec(f: HistoryFilters): QuerySpec {
  const where: QueryCond[] = [];
  if (f.type !== 'all') where.push({ field: 'type', op: 'eq', value: f.type });
  if (f.disabledTypes.length) where.push({ field: 'type', op: 'nin', value: f.disabledTypes });
  if (f.gameId) where.push({ field: 'gameId', op: 'eq', value: f.gameId });
  else where.push({ or: [{ field: 'gameId', op: 'null', value: true }, { field: 'gameId', op: 'in', value: f.enabledGameIds }] });
  if (f.playerId) where.push({ or: [{ field: 'p1', op: 'eq', value: f.playerId }, { field: 'p2', op: 'eq', value: f.playerId }] });
  if (f.resultFor) {
    const { participantId, result } = f.resultFor;
    where.push(
      result === 'wins'
        ? { field: 'winnerId', op: 'eq', value: participantId }
        : { or: [{ field: 'winnerId', op: 'null', value: true }, { field: 'winnerId', op: 'neq', value: participantId }] }
    );
  }
  return { where, sort: [{ field: 'date', dir: 'desc' }] };
}

export type HistoryCounts = Record<HistoryType, number>;

/** Per-type totals for the filter chips; last known values offline, null if never loaded. */
export async function getHistoryCounts(communityId: string): Promise<HistoryCounts | null> {
  const r = await readThrough<HistoryCounts>({
    path: `/api/history/counts?communityId=${encodeURIComponent(communityId)}`,
    store: COUNTS_STORE,
    key: communityId,
    label: 'getHistoryCounts',
    init: { headers: { ...getAuthHeader() } },
  });
  return 'data' in r ? r.data : null;
}
