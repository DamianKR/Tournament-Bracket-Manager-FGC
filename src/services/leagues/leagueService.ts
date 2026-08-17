/**
 * League Service
 * 
 * Handles all league-related API calls and local storage sync.
 */

import { League, LeagueMatch, LeagueStanding } from '@/models/league';

const LOCAL_SERVER = 'http://localhost:3001';

// ── API Calls ─────────────────────────────────────────────────────────────

export async function getAllLeagues(): Promise<League[]> {
  try {
    const res = await fetch(`${LOCAL_SERVER}/api/leagues`);
    if (!res.ok) throw new Error('Failed to fetch leagues');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] getAllLeagues error:', err);
    return [];
  }
}

export async function getLeague(id: string): Promise<League | null> {
  try {
    const res = await fetch(`${LOCAL_SERVER}/api/leagues/${id}`);
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
    const res = await fetch(`${LOCAL_SERVER}/api/leagues/estimate`, {
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
  gamesPerMatch: 3 | 5;
  matchesPerPlayerPerPeriod: number;
  periodDays: 7 | 14;
  startDate: string;
  maxNoShowsBeforeKick: number;
  playoffsEnabled: boolean;
  playoffsEloMultiplier: number;
}): Promise<{ league: League; matchesCreated: number } | null> {
  try {
    const res = await fetch(`${LOCAL_SERVER}/api/leagues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${LOCAL_SERVER}/api/leagues/${leagueId}/matches`);
    if (!res.ok) throw new Error('Failed to fetch league matches');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] getLeagueMatches error:', err);
    return [];
  }
}

export async function getLeagueStandings(leagueId: string): Promise<LeagueStanding[]> {
  try {
    const res = await fetch(`${LOCAL_SERVER}/api/leagues/${leagueId}/standings`);
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
  }
): Promise<{ match: LeagueMatch; eloChanges: Record<string, number> } | null> {
  try {
    const res = await fetch(`${LOCAL_SERVER}/api/leagues/${leagueId}/matches/${matchId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    if (!res.ok) throw new Error('Failed to report match result');
    return await res.json();
  } catch (err) {
    console.error('[LeagueService] reportMatchResult error:', err);
    return null;
  }
}

export async function deleteLeague(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_SERVER}/api/leagues/${id}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.error('[LeagueService] deleteLeague error:', err);
    return false;
  }
}
