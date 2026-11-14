/**
 * Ranking Service — Frontend
 *
 * Communicates with the local Express API for all ELO ranking operations.
 * After any write operation (recordMatch, reset), the server returns the
 * updated participant objects and this service patches localStorage so both
 * sources stay in sync.
 *
 * All functions throw on network error; callers should handle gracefully.
 */

import type { MatchRecord, GlobalParticipant, MatchGame } from '../../models/types';
import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';
import { enqueueMatchOp } from '@/services/storage/matchOpsQueue';
import { readThrough } from '@/services/storage/readThrough';
import { createListMirror } from '@/services/pagination/listMirror';
import { createServerPagedSource } from '@/services/pagination/pagedSource';
import type { PagedSource } from '@/services/pagination/pagedSource';
import type { QueryCond, QuerySpec } from '../../../shared/query.js';
import { getEffectiveElo } from '@/utils/participantGames';
import { getRankName } from '@/utils/rank';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';

// ── localStorage sync helpers ─────────────────────────────────────────────

const LS_PARTICIPANTS_KEY = 'bracket_global_participants';

// ── Leaderboard cache (unpaged read, used by the dashboard and profiles) ───
// Keyed by communityId+gameId so multiple communities/games are independent.

const LS_LEADERBOARD_KEY = 'bracket_leaderboard_cache';

function _cacheKey(communityId = '', gameId = ''): string {
  return `${communityId}::${gameId}`;
}

function lsPatchParticipants(updated: GlobalParticipant[]): void {
  try {
    const raw = localStorage.getItem(LS_PARTICIPANTS_KEY);
    const all: GlobalParticipant[] = raw ? JSON.parse(raw) : [];
    for (const u of updated) {
      const idx = all.findIndex((p) => p.id === u.id);
      if (idx >= 0) { all[idx] = { ...all[idx], ...u }; }
      else { all.push(u); }
    }
    localStorage.setItem(LS_PARTICIPANTS_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable — non-critical
  }
}

const API_BASE = `${SERVER_URL}/api/ranking`;

// ── Types ─────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  position: number | null;
  id: string;
  name: string;
  alias: string;
  avatarUrl: string | null;
  eloPoints: number | null;
  eloRank: string;
  displayRank: string;   // 'Legend' for top 5, 'Sin puntos' for unranked
  gameId: string | null;
  mainCharacterId: string | null;
}

export interface MatchResult {
  match: MatchRecord;
  playerA: {
    id: string;
    name: string;
    pointsBefore: number;
    pointsAfter: number;
    delta: number;
    rankBefore: string;
    rankAfter: string;
  };
  playerB: {
    id: string;
    name: string;
    pointsBefore: number;
    pointsAfter: number;
    delta: number;
    rankBefore: string;
    rankAfter: string;
  };
  /** true when the match was queued offline — the server computes ELO on delivery. */
  queued?: boolean;
}

// ── Rank color helper (mirrors server-side) ───────────────────────────────

const RANK_COLORS: Record<string, string> = {
  Bronce:     '#8b5a2b',
  Plata:      '#94a3b8',
  Oro:        '#f59e0b',
  Platino:    '#06b6d4',
  Diamante:   '#2563eb',
  Vanquisher: '#a855f7',
  Master:     '#ec4899',
  Ultimate:   '#971c0e',
  Legend:     '#10b981',
};

export function getRankColor(rank: string): string {
  return RANK_COLORS[rank] ?? '#94a3b8';
}

export function getRankIcon(rank: string): string {
  const icons: Record<string, string> = {
    Bronce:     'fas fa-medal',
    Plata:      'fas fa-medal',
    Oro:        'fas fa-medal',
    Platino:    'fas fa-gem',
    Diamante:   'fas fa-gem',
    Vanquisher: 'fas fa-shield-alt',
    Master:     'fas fa-crown',
    Ultimate:   'fas fa-fire',
    Legend:     'fas fa-dragon',
  };
  return icons[rank] ?? 'fas fa-gamepad';
}

// ── API calls ─────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/** Fetches the leaderboard for a specific game sorted by ELO descending.
 *  Saves result to localStorage on success; falls back to cached data when
 *  the server is unreachable (offline). Throws only when offline AND no cache. */
export async function getLeaderboard(communityId?: string, gameId?: string): Promise<LeaderboardEntry[]> {
  const query = buildQuery({ communityId, gameId: gameId ?? '' });
  const r = await readThrough<LeaderboardEntry[]>({
    path: `/api/ranking${query}`,
    store: LS_LEADERBOARD_KEY,
    key: _cacheKey(communityId, gameId),
    label: 'getLeaderboard',
  });
  if ('data' in r) return r.data;
  throw new Error('No leaderboard data available offline');
}

// ── Paginated ranked history ──────────────────────────────────────────────
// Server pages (filters/search/sort run in the DB) over a local copy that is
// filled page by page; offline the same query runs on that copy.

export type RankedHistoryMatch = MatchRecord & {
  playerAPointsBefore: number; playerBPointsBefore: number;
  playerAPointsAfter: number; playerBPointsAfter: number;
  playerADelta: number; playerBDelta: number;
  playerARankBefore: string; playerBRankBefore: string;
  playerARankAfter: string; playerBRankAfter: string;
};

const HISTORY_PAGES_STORE = 'bracket_history_pages';

function rankedHistoryMirror(communityId: string) {
  return createListMirror<RankedHistoryMatch>(HISTORY_PAGES_STORE, communityId);
}

export function createRankedHistorySource(communityId: string): PagedSource<RankedHistoryMatch> {
  return createServerPagedSource<RankedHistoryMatch>({
    id: 'ranking-history',
    path: '/api/ranking/matches',
    params: { communityId },
    init: () => ({ headers: { ...getAuthHeader() } }),
    mirror: rankedHistoryMirror(communityId),
  });
}

// ── Paginated leaderboard ─────────────────────────────────────────────────
// Positions / Legend are computed by the server over the whole board; pages are
// cut afterwards. The local copy (filled page by page) serves it offline.

const LEADERBOARD_PAGES_STORE = 'bracket_leaderboard_pages';

export function createLeaderboardSource(communityId: string, gameId: string): PagedSource<LeaderboardEntry> {
  return createServerPagedSource<LeaderboardEntry>({
    id: 'ranking-leaderboard',
    path: '/api/ranking',
    params: { communityId, gameId },
    init: () => ({ headers: { ...getAuthHeader() } }),
    mirror: createListMirror<LeaderboardEntry>(LEADERBOARD_PAGES_STORE, _cacheKey(communityId, gameId)),
    refreshAfterMs: 5 * 60 * 1000,
  });
}

/** Ranked players by position, then the unranked alphabetically (same order online and offline). */
export const LEADERBOARD_SPEC: QuerySpec = {
  sort: [{ field: 'position', dir: 'asc', type: 'number' }, { field: 'name', dir: 'asc' }],
};

/** ELO changed (reset…): the local copy of that board is stale. */
export function clearLeaderboard(communityId: string, gameId: string): void {
  createListMirror<LeaderboardEntry>(LEADERBOARD_PAGES_STORE, _cacheKey(communityId, gameId)).clear();
}

/**
 * The History tab's filters as a query (runs in the DB online, on the local
 * copy offline):
 *   - a chosen game, or every game enabled in the community (untagged legacy rows too)
 *   - duel / matchmaking rows hidden when that module is off (untyped legacy rows stay)
 *   - one player on either side
 * Newest first.
 */
export function buildRankedHistorySpec(o: {
  gameId: string | 'all';
  communityGameIds: string[];
  duelsOn: boolean;
  matchmakingOn: boolean;
  playerId: string | null;
}): QuerySpec {
  const where: QueryCond[] = [];
  if (o.gameId !== 'all') where.push({ field: 'gameId', op: 'eq', value: o.gameId });
  else where.push({ or: [{ field: 'gameId', op: 'null', value: true }, { field: 'gameId', op: 'in', value: o.communityGameIds }] });
  const off = [!o.duelsOn && 'duel', !o.matchmakingOn && 'matchmaking'].filter((x): x is string => !!x);
  if (off.length) where.push({ or: [{ field: 'type', op: 'null', value: true }, { field: 'type', op: 'nin', value: off }] });
  if (o.playerId) where.push({ or: [{ field: 'playerAId', op: 'eq', value: o.playerId }, { field: 'playerBId', op: 'eq', value: o.playerId }] });
  return { where, sort: [{ field: 'createdAt', dir: 'desc' }] };
}

/** A match was deleted: drop it from the local copy too. */
export function forgetRankedMatch(communityId: string, matchId: string): void {
  rankedHistoryMirror(communityId).remove([matchId]);
}

/** History was wiped (hard reset): the local copy is no longer valid. */
export function clearRankedHistory(communityId: string): void {
  rankedHistoryMirror(communityId).clear();
}

/** Fetches match history for a single participant. */
export async function getMatchesForParticipant(participantId: string, communityId?: string, gameId?: string): Promise<MatchRecord[]> {
  const query = buildQuery({ communityId, gameId: gameId ?? '' });
  const res = await fetch(`${API_BASE}/matches/${participantId}${query}`);
  if (!res.ok) throw new Error(`Failed to load matches: ${res.status}`);
  return res.json();
}

/**
 * Records a match and updates per-game ELO for both players.
 * Also patches localStorage so both sources stay in sync.
 *
 * OFFLINE: when the server is unreachable the operation is appended to the
 * ordered match-ops queue (bracket_pending_match_ops) and replayed by
 * syncPendingMatchOps on reconnect — the server computes the real ELO on
 * delivery, so queued matches stay correct even when other results land
 * first. The returned MatchResult has `queued: true` and placeholder ELO
 * fields (current local values, delta 0) — the UI should show it as
 * "recorded, pending sync" rather than an error.
 */
export async function recordMatch(
  playerAId: string,
  playerBId: string,
  winnerId: string,
  gameId: string,
  matchType: 'duel' | 'matchmaking' | 'free' = 'free',
  communityId?: string,
  scoreA?: number,
  scoreB?: number,
  games?: MatchGame[],
  extra?: { seasonId?: string; periodIndex?: number; duelChallengeId?: string }
): Promise<MatchResult> {
  // Client-generated id — the server honors it and dedupes on it, so a
  // queued op retried after a lost response never applies ELO twice.
  const matchId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const body: Record<string, unknown> = {
    id: matchId,
    playerAId,
    playerBId,
    winnerId,
    gameId,
    matchType,
    communityId,
    player1Score: scoreA,
    player2Score: scoreB,
    games,
    ...(extra?.seasonId && { seasonId: extra.seasonId }),
    ...(extra?.periodIndex !== undefined && { periodIndex: extra.periodIndex }),
    ...(extra?.duelChallengeId && { duelChallengeId: extra.duelChallengeId }),
  };

  let res: Response | null = null;
  if (await isServerAvailable()) {
    try {
      res = await fetch(`${API_BASE}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      });
    } catch {
      resetServerCache();
      res = null;
    }
  }

  if (res?.ok) {
    const data = await res.json();
    // Patch localStorage with the updated ELO values from the server
    const toSync: GlobalParticipant[] = [
      data.updatedParticipantA,
      data.updatedParticipantB,
    ].filter(Boolean) as GlobalParticipant[];
    if (toSync.length) lsPatchParticipants(toSync);
    return data as MatchResult;
  }

  // Permanent server rejection (validation/auth) — don't queue, surface it.
  if (res && res.status >= 400 && res.status < 500) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? `Failed to record match: ${res.status}`);
  }

  // Offline or transient 5xx → enqueue for ordered replay on reconnect.
  enqueueMatchOp({ id: `op_${matchId}`, method: 'POST', path: '/api/ranking/match', body });

  // Build a placeholder result from local participant state so callers can
  // show "recorded — pending sync" and link the match id to duels/assignments.
  const locals = lsReadParticipants();
  const pA = locals.find((p) => p.id === playerAId);
  const pB = locals.find((p) => p.id === playerBId);
  const eloA = pA ? getEffectiveElo(pA, gameId) : 1500;
  const eloB = pB ? getEffectiveElo(pB, gameId) : 1500;
  const queuedMatch: MatchRecord = {
    id: matchId,
    playerAId,
    playerBId,
    winnerId,
    loserId: winnerId === playerAId ? playerBId : playerAId,
    type: matchType,
    gameId,
    playerAPointsBefore: eloA,
    playerBPointsBefore: eloB,
    playerAPointsAfter: eloA,
    playerBPointsAfter: eloB,
    playerADelta: 0,
    playerBDelta: 0,
    playerARankBefore: getRankName(eloA),
    playerBRankBefore: getRankName(eloB),
    playerARankAfter: getRankName(eloA),
    playerBRankAfter: getRankName(eloB),
    ...(scoreA !== undefined && { player1Score: scoreA }),
    ...(scoreB !== undefined && { player2Score: scoreB }),
    ...(games && { games }),
    communityId: communityId || DEFAULT_COMMUNITY_ID,
    createdAt: new Date().toISOString(),
  };
  return {
    queued: true,
    match: queuedMatch,
    playerA: {
      id: playerAId,
      name: pA?.name ?? playerAId,
      pointsBefore: eloA,
      pointsAfter: eloA,
      delta: 0,
      rankBefore: getRankName(eloA),
      rankAfter: getRankName(eloA),
    },
    playerB: {
      id: playerBId,
      name: pB?.name ?? playerBId,
      pointsBefore: eloB,
      pointsAfter: eloB,
      delta: 0,
      rankBefore: getRankName(eloB),
      rankAfter: getRankName(eloB),
    },
  };
}

function lsReadParticipants(): GlobalParticipant[] {
  try {
    const raw = localStorage.getItem(LS_PARTICIPANTS_KEY);
    return raw ? (JSON.parse(raw) as GlobalParticipant[]) : [];
  } catch {
    return [];
  }
}

/** Deletes a match record. Does NOT revert ELO. */
export async function deleteMatch(matchId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/matches/${matchId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(`Failed to delete match: ${res.status}`);
}

/** Hard reset: all participants → 1500 pts for a game. Clears match history. Syncs localStorage. */
export async function hardResetRanking(communityId?: string, gameId?: string): Promise<{ affectedParticipants: number }> {
  const body: Record<string, string> = {};
  if (communityId) body.communityId = communityId;
  if (gameId) body.gameId = gameId;
  const res = await fetch(`${API_BASE}/reset/hard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hard reset failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data.updatedParticipants)) {
    lsPatchParticipants(data.updatedParticipants as GlobalParticipant[]);
  }
  return data;
}

/** Soft reset: each participant → start of their current tier for a game. Syncs localStorage. */
export async function softResetRanking(communityId?: string, gameId?: string): Promise<{ affectedParticipants: number }> {
  const body: Record<string, string> = {};
  if (communityId) body.communityId = communityId;
  if (gameId) body.gameId = gameId;
  const res = await fetch(`${API_BASE}/reset/soft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Soft reset failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data.updatedParticipants)) {
    lsPatchParticipants(data.updatedParticipants as GlobalParticipant[]);
  }
  return data;
}


