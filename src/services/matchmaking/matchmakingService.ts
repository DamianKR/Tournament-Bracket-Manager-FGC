/**
 * Matchmaking Service — recurring season model
 */

import { SERVER_URL } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';

const BASE = `${SERVER_URL}/api/matchmaking`;

export interface MatchmakingPeriod {
  index: number;
  startDate: string;
  endDate: string;
  status: 'pending' | 'active' | 'skipped';
}

export interface MatchmakingSeason {
  id: string;
  communityId: string;
  gameId: string;
  name: string;
  periodType: 'weekly' | 'biweekly';
  matchesPerPlayer: number;   // 1–10
  gracePeriodDays: number;
  startDate: string;
  status: 'draft' | 'active' | 'closed';
  totalPeriods?: number | null;
  endDate?: string | null;
  currentPeriod: MatchmakingPeriod;
  createdAt: string;
  updatedAt: string;
  /** Populated by GET /seasons/:id */
  assignments?: MatchmakingAssignment[];
  allAssignments?: MatchmakingAssignment[];
}

export interface MatchmakingAssignment {
  id: string;
  seasonId: string;
  communityId: string;
  gameId: string;
  periodIndex: number;
  player1Id: string;
  player2Id: string;
  status: 'pending' | 'completed' | 'forfeit_p1' | 'forfeit_p2' | 'cancelled';
  winnerId?: string | null;
  rankedMatchId?: string | null;
  forfeitNote?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSeasonPayload {
  communityId: string;
  gameId: string;
  name: string;
  periodType: 'weekly' | 'biweekly';
  matchesPerPlayer: number;
  gracePeriodDays: number;
  startDate: string;
  /** If set, season auto-closes after this many periods. */
  totalPeriods?: number;
  /** If set, season auto-closes when this date passes. */
  endDate?: string;
}

// ── Seasons ──────────────────────────────────────────────────────────────────

export async function getSeasons(communityId: string): Promise<MatchmakingSeason[]> {
  const res = await fetch(`${BASE}/seasons?communityId=${communityId}`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSeasonDetail(seasonId: string): Promise<MatchmakingSeason> {
  const res = await fetch(`${BASE}/seasons/${seasonId}`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSeason(payload: CreateSeasonPayload): Promise<MatchmakingSeason> {
  const res = await fetch(`${BASE}/seasons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateSeason(
  seasonId: string,
  payload: Partial<Pick<MatchmakingSeason, 'name' | 'matchesPerPlayer' | 'gracePeriodDays'>>
): Promise<MatchmakingSeason> {
  const res = await fetch(`${BASE}/seasons/${seasonId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSeason(seasonId: string): Promise<void> {
  const res = await fetch(`${BASE}/seasons/${seasonId}`, { method: 'DELETE', headers: getAuthHeader() });
  if (!res.ok) throw new Error(await res.text());
}

export async function generateMatchmaking(seasonId: string): Promise<{
  season: MatchmakingSeason;
  assignments: MatchmakingAssignment[];
  totalPlayers: number;
}> {
  const res = await fetch(`${BASE}/seasons/${seasonId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function advancePeriod(seasonId: string): Promise<{
  season: MatchmakingSeason;
  assignments: MatchmakingAssignment[];
  totalPlayers: number;
}> {
  const res = await fetch(`${BASE}/seasons/${seasonId}/advance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function closeSeason(seasonId: string): Promise<{ ok: boolean; closedAssignments: number }> {
  const res = await fetch(`${BASE}/seasons/${seasonId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function getAssignments(params: {
  communityId?: string;
  seasonId?: string;
  participantId?: string;
}): Promise<MatchmakingAssignment[]> {
  const qs = new URLSearchParams();
  if (params.communityId) qs.set('communityId', params.communityId);
  if (params.seasonId) qs.set('seasonId', params.seasonId);
  if (params.participantId) qs.set('participantId', params.participantId);
  const res = await fetch(`${BASE}/assignments?${qs}`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function recordAssignmentResult(
  assignmentId: string,
  payload: { winnerId: string; games?: unknown[] }
): Promise<{ assignment: MatchmakingAssignment }> {
  const res = await fetch(`${BASE}/assignments/${assignmentId}/result`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function forfeitAssignment(
  assignmentId: string,
  forfeitPlayerId: string,
  note?: string
): Promise<{ assignment: MatchmakingAssignment }> {
  const res = await fetch(`${BASE}/assignments/${assignmentId}/forfeit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ forfeitPlayerId, note }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cancelAssignment(
  assignmentId: string,
  reason?: string
): Promise<{ assignment: MatchmakingAssignment }> {
  const res = await fetch(`${BASE}/assignments/${assignmentId}/cancel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Sets available:false for every participant in a community+game. */
export async function resetAvailability(
  communityId: string,
  gameId: string
): Promise<{ ok: boolean; updated: number }> {
  const res = await fetch(`${BASE}/reset-availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ communityId, gameId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
