/**
 * League Service
 * 
 * Handles all league-related API calls and local storage sync.
 */

import { League, LeagueMatch, LeagueStanding } from '@/models/league';
import { SERVER_URL } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';
import { isDateInTimeZonePassed } from '@/utils/timeZone';

// ── API Calls ─────────────────────────────────────────────────────────────

export async function getAllLeagues(): Promise<League[]> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues`);
    if (!res.ok) throw new Error('Failed to fetch leagues');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] getAllLeagues error:', err);
    return [];
  }
}

export async function getLeague(id: string): Promise<League | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] getLeague error:', err);
    return null;
  }
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
  playoffsEnabled: boolean;
  playoffsEloMultiplier: number;
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

export async function getLeagueMatches(leagueId: string): Promise<LeagueMatch[]> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/matches`);
    if (!res.ok) throw new Error('Failed to fetch league matches');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] getLeagueMatches error:', err);
    return [];
  }
}

export async function getLeagueStandings(leagueId: string): Promise<LeagueStanding[]> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/standings`);
    if (!res.ok) throw new Error('Failed to fetch standings');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] getLeagueStandings error:', err);
    return [];
  }
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
  }
): Promise<{ match: LeagueMatch; eloChanges: Record<string, number> | null } | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/matches/${matchId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(result),
    });
    if (!res.ok) throw new Error('Failed to report match result');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] reportMatchResult error:', err);
    return null;
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
  }
): Promise<{ match: LeagueMatch; eloChanges: Record<string, number> } | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${leagueId}/matches/${matchId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(result),
    });
    if (!res.ok) throw new Error('Failed to resolve match dispute');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] resolveLeagueMatch error:', err);
    return null;
  }
}

export async function deleteLeague(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/leagues/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
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
