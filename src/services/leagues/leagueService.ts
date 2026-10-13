/**
 * League Service
 * 
 * Handles all league-related API calls and local storage sync.
 */

import { League, LeagueMatch, LeagueStanding } from '@/models/league';
import type { MatchGame } from '@/models/rankedMatch';
import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';
import { enqueueMatchOp, readMatchOps } from '@/services/storage/matchOpsQueue';
import { mirrorGet, mirrorDel } from '@/services/storage/mirrorStore';
import { readThrough, dataOr } from '@/services/storage/readThrough';
import { isDateInTimeZonePassed } from '@/utils/timeZone';

// ── Read cache (stale-while-revalidate) ───────────────────────────────────
// Reads go through the shared readThrough/mirrorStore helpers: server when
// reachable, last mirror when offline or on a 5xx. Writes (report/resolve)
// queue offline through matchOpsQueue.

const CACHE = {
  leagues: 'bracket_leagues_cache',
  league: 'bracket_league_cache',
  leagueMatches: 'bracket_league_matches_cache',
  allMatches: 'bracket_all_league_matches_cache',
  standings: 'bracket_league_standings_cache',
} as const;

const ALL_KEY = 'all';
const MAX_CACHED_EVIDENCE_CHARS = 2048;

/** Evidence photos are base64 blobs — drop them from the mirror so match
 *  lists don't eat the localStorage quota. A short marker keeps the
 *  "with evidence" label working. */
function slimMatches(matches: LeagueMatch[]): LeagueMatch[] {
  return matches.map((m) =>
    m.reportedResults?.some((r) => (r.evidence?.length ?? 0) > MAX_CACHED_EVIDENCE_CHARS)
      ? {
          ...m,
          reportedResults: m.reportedResults.map((r) =>
            (r.evidence?.length ?? 0) > MAX_CACHED_EVIDENCE_CHARS ? { ...r, evidence: '…' } : r
          ),
        }
      : m
  );
}

export function getLeaguesCached(communityId?: string): League[] | null {
  return mirrorGet<League[]>(CACHE.leagues, communityId ?? ALL_KEY)?.data ?? null;
}

export function getLeagueCached(id: string): League | null {
  return mirrorGet<League>(CACHE.league, id)?.data ?? null;
}

export function getLeagueMatchesCached(leagueId: string): LeagueMatch[] | null {
  return mirrorGet<LeagueMatch[]>(CACHE.leagueMatches, leagueId)?.data ?? null;
}

export function getLeagueStandingsCached(leagueId: string): LeagueStanding[] | null {
  return mirrorGet<LeagueStanding[]>(CACHE.standings, leagueId)?.data ?? null;
}

// ── API Calls ─────────────────────────────────────────────────────────────

export async function getAllLeagues(communityId?: string): Promise<League[]> {
  const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
  return dataOr(
    await readThrough<League[]>({ path: `/api/leagues${query}`, store: CACHE.leagues, key: communityId ?? ALL_KEY, label: 'getAllLeagues' }),
    []
  );
}

export async function getLeague(id: string): Promise<League | null> {
  return dataOr(
    await readThrough<League | null>({
      path: `/api/leagues/${id}`, store: CACHE.league, key: id, label: 'getLeague', goneStatuses: [404],
    }),
    null
  );
}

export async function estimateLeagueDuration(config: {
  participantCount: number;
  roundsPerOpponent: number;
  matchesPerPlayerPerPeriod: number;
  periodDays: number;
  startDate: string;
}): Promise<{
  weeks: number;
  days: number;
  endDate: string;
  totalMatches: number;
  matchesPerPlayer: number;
} | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Failed to estimate duration');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] estimateLeagueDuration error:', err);
    return null;
  }
}

export async function createLeague(config: {
  name: string;
  gameId: string;
  participantIds: string[];
  roundsPerOpponent: 1 | 2 | 3;
  gamesPerMatch: 3 | 5 | 7 | 9;
  matchesPerPlayerPerPeriod: number;
  periodDays: 7 | 14;
  startDate: string;
  timeZone?: string;
  maxNoShowsBeforeKick: number;
  gracePeriodDays?: number;
  playoffsEnabled: boolean;
  playoffsEloMultiplier: number;
  communityId?: string;
}): Promise<{ league: League; matchesCreated: number } | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Failed to create league');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] createLeague error:', err);
    return null;
  }
}

export async function registerForLeague(leagueId: string): Promise<League | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to register for league');
    }
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] registerForLeague error:', err);
    throw err;
  }
}

export async function startLeague(leagueId: string): Promise<{ league: League; matchesCreated: number } | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to start league');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] startLeague error:', err);
    throw err;
  }
}

export async function getLeagueMatches(leagueId: string): Promise<LeagueMatch[]> {
  return dataOr(
    await readThrough<LeagueMatch[]>({
      path: `/api/leagues/${leagueId}/matches`, store: CACHE.leagueMatches, key: leagueId,
      label: 'getLeagueMatches', prepare: slimMatches,
    }),
    []
  );
}

export async function getAllLeagueMatches(communityId?: string): Promise<LeagueMatch[]> {
  const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
  return dataOr(
    await readThrough<LeagueMatch[]>({
      path: `/api/leagues/matches${query}`, store: CACHE.allMatches, key: communityId ?? ALL_KEY,
      label: 'getAllLeagueMatches', prepare: slimMatches,
    }),
    []
  );
}

export async function getLeagueStandings(leagueId: string): Promise<LeagueStanding[]> {
  return dataOr(
    await readThrough<LeagueStanding[]>({
      path: `/api/leagues/${leagueId}/standings`, store: CACHE.standings, key: leagueId, label: 'getLeagueStandings',
    }),
    []
  );
}

export interface LeagueReportResult {
  match: LeagueMatch;
  eloChanges: Record<string, number> | null;
  /** true when the op was queued offline — the server applies ELO on replay. */
  queued?: boolean;
}

/**
 * Posts a league op, or queues it for ordered replay when the server is
 * unreachable / returns 5xx. 4xx responses still throw (permanent errors).
 */
async function postLeagueOp(
  path: string,
  body: Record<string, unknown>,
  fallbackMatchId: string,
): Promise<LeagueReportResult> {
  let res: Response | null = null;
  if (await isServerAvailable()) {
    try {
      res = await fetch(`${SERVER_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      });
    } catch {
      resetServerCache();
      res = null;
    }
  }

  if (res?.ok) return (await res.json()) as LeagueReportResult;

  if (res && res.status >= 400 && res.status < 500) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `League op failed (${res.status})`);
  }

  // Offline / transient failure → ordered queue replay applies it later.
  // Skip the enqueue if an op for this exact endpoint is already queued —
  // a second report of the same match would replay a duplicate write.
  if (!readMatchOps().some((op) => op.path === path)) {
    enqueueMatchOp({ id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, method: 'POST', path, body });
  }
  return {
    match: { id: fallbackMatchId } as LeagueMatch,
    eloChanges: null,
    queued: true,
  };
}

const LEAGUE_OP_RE = /\/api\/leagues\/[^/]+\/matches\/([^/]+)\/(report|resolve)/;

/** Match IDs with a report/resolve op still sitting in the offline queue —
 *  read once per render so lists don't re-parse localStorage per row. */
export function getPendingLeagueOpMatchIds(): Set<string> {
  const ids = new Set<string>();
  for (const op of readMatchOps()) {
    const m = LEAGUE_OP_RE.exec(op.path);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/**
 * True if this league match already has a report/resolve op sitting in the
 * offline queue — the UI shows "queued" instead of offering Report again.
 */
export function hasPendingLeagueOp(matchId: string): boolean {
  return getPendingLeagueOpMatchIds().has(matchId);
}

export async function reportMatchResult(
  leagueId: string,
  matchId: string,
  result: {
    winnerId: string;
    score: string;
    isNoShow: boolean;
    noShowParticipantId?: string;
    evidence?: string;
    games?: MatchGame[];
  }
): Promise<LeagueReportResult | null> {
  try {
    return await postLeagueOp(`/api/leagues/${leagueId}/matches/${matchId}/report`, result, matchId);
  } catch (err) {
    console.error('[LeagueService] reportMatchResult error:', err);
    throw err;
  }
}

export async function resolveLeagueMatch(
  leagueId: string,
  matchId: string,
  result: {
    winnerId: string;
    score: string;
    isNoShow: boolean;
    noShowParticipantId?: string;
    games?: MatchGame[];
  }
): Promise<LeagueReportResult | null> {
  try {
    return await postLeagueOp(`/api/leagues/${leagueId}/matches/${matchId}/resolve`, result, matchId);
  } catch (err) {
    console.error('[LeagueService] resolveLeagueMatch error:', err);
    throw err;
  }
}

export async function deleteLeague(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (res.ok) {
      mirrorDel(CACHE.league, id);
      mirrorDel(CACHE.leagueMatches, id);
      mirrorDel(CACHE.standings, id);
    }
    return res.ok;
  } catch (err) {
    console.error('[LeagueService] deleteLeague error:', err);
    return false;
  }
}

/**
 * Returns the display status for a league.
 * Active leagues are shown as 'pending' until their startDate is reached.
 */
export function getLeagueDisplayStatus(league: League): 'pending' | 'active' | 'completed' {
  if (league.status === 'completed') return 'completed';
  if (league.status === 'draft') return 'pending';
  // If startDate is a full ISO string, compare directly.
  // If it's only a date (YYYY-MM-DD), compare as calendar date in the league time zone.
  if (league.startDate.includes('T')) {
    if (new Date(league.startDate) > new Date()) return 'pending';
  } else {
    const timeZone = league.timeZone || 'America/Havana';
    if (!isDateInTimeZonePassed(league.startDate, timeZone)) return 'pending';
  }
  return 'active';
}

/**
 * Expire old scheduled matches and mark them as pending_review
 */
export async function expireLeagueMatches(leagueId: string): Promise<number> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/expire-matches`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
    if (!res.ok) throw new Error('Failed to expire matches');
    const data = await res.json();
    return data.expiredCount || 0;
  } catch (err) {
    console.error('[LeagueService] expireLeagueMatches error:', err);
    return 0;
  }
}

/**
 * Mark a pending_review match as no-show.
 * Returns the server response (includes banEligible flag) or null on failure.
 */
export async function markMatchNoShow(
  leagueId: string,
  matchId: string,
  noShowParticipantId: string
): Promise<{ banEligible?: { participantId: string; name: string; alias?: string; noShowCount: number } } | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/matches/${matchId}/mark-no-show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ noShowParticipantId }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] markMatchNoShow error:', err);
    return null;
  }
}

/**
 * Cancel a pending_review match without penalty
 */
export async function cancelMatch(leagueId: string, matchId: string): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/matches/${matchId}/cancel`, {
      method: 'POST',
      headers: getAuthHeader(),
    });
    return res.ok;
  } catch (err) {
    console.error('[LeagueService] cancelMatch error:', err);
    return false;
  }
}

/**
 * Get participants eligible for ban (reached max no-shows)
 */
export async function getEligibleForBan(leagueId: string): Promise<{
  eligible: Array<{
    participantId: string;
    name: string;
    alias?: string;
    noShowCount: number;
  }>;
  maxNoShows: number;
} | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/eligible-for-ban`);
    if (!res.ok) throw new Error('Failed to get eligible participants');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] getEligibleForBan error:', err);
    return null;
  }
}

/**
 * Ban participants and regenerate schedule
 */
export async function banParticipants(
  leagueId: string,
  participantIds: string[]
): Promise<{
  bannedCount: number;
  activeParticipants: number;
  newMatchesCreated: number;
  completedMatchesPreserved: number;
} | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/ban-participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ participantIds }),
    });
    if (!res.ok) throw new Error('Failed to ban participants');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] banParticipants error:', err);
    return null;
  }
}

/**
 * Regenerate league schedule (preserves completed matches, regenerates future ones)
 */
export async function regenerateSchedule(
  leagueId: string
): Promise<{
  activeParticipants: number;
  newMatchesCreated: number;
  completedMatchesPreserved: number;
  deletedMatches: number;
} | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/regenerate-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Failed to regenerate schedule');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] regenerateSchedule error:', err);
    return null;
  }
}
