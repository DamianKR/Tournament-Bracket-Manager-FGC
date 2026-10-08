/**
 * Matchmaking Service — recurring season model
 */

import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';
import { enqueueMatchOp } from '@/services/storage/matchOpsQueue';

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
  /** Admin-removed player ids — excluded from pairing, pending matches cancelled. */
  removedParticipants?: string[];
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

/** Remove (ban) or restore a participant in a season — pending matches cancelled without penalty. */
export async function setSeasonParticipantRemoved(
  seasonId: string,
  participantId: string,
  removed: boolean
): Promise<{ ok: boolean; removedParticipants: string[]; cancelled: number }> {
  const res = await fetch(`${BASE}/seasons/${seasonId}/participants/${participantId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ removed }),
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

/**
 * PUTs an assignment op, or queues it for ordered replay when the server is
 * unreachable / returns 5xx. Queued ops land in the same FIFO queue as
 * recordMatch — so the match they link always reaches the server first.
 * 4xx responses still throw (permanent errors).
 */
async function putAssignmentOp(
  assignmentId: string,
  action: 'result' | 'forfeit',
  body: Record<string, unknown>
): Promise<{ assignment: MatchmakingAssignment }> {
  const path = `/api/matchmaking/assignments/${assignmentId}/${action}`;
  let res: Response | null = null;
  if (await isServerAvailable()) {
    try {
      res = await fetch(`${SERVER_URL}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      });
    } catch {
      resetServerCache();
      res = null;
    }
  }

  if (res?.ok) return res.json();

  if (res && res.status >= 400 && res.status < 500) {
    throw new Error(await res.text());
  }

  // Offline / transient failure → replay on reconnect.
  enqueueMatchOp({
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    method: 'PUT',
    path,
    body,
  });
  return { assignment: { id: assignmentId } as MatchmakingAssignment };
}

/** Links an assignment to a ranked match already recorded via recordMatch(). */
export async function recordAssignmentResult(
  assignmentId: string,
  payload: { winnerId: string; matchId?: string }
): Promise<{ assignment: MatchmakingAssignment }> {
  return putAssignmentOp(assignmentId, 'result', payload);
}

export async function forfeitAssignment(
  assignmentId: string,
  forfeitPlayerId: string,
  note?: string,
  matchId?: string
): Promise<{ assignment: MatchmakingAssignment }> {
  return putAssignmentOp(assignmentId, 'forfeit', { forfeitPlayerId, note, matchId });
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

/** Sets the activity availability flag for every participant in a community+game. */
export async function setAvailability(
  communityId: string,
  gameId: string,
  activity: 'ranked' | 'leagues' | 'tournaments',
  value: boolean
): Promise<{ ok: boolean; updated: number }> {
  const res = await fetch(`${BASE}/reset-availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ communityId, gameId, activity, value }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Sets the activity availability flag to false for every participant in a community+game. */
export async function resetAvailability(
  communityId: string,
  gameId: string,
  activity: 'ranked' | 'leagues' | 'tournaments' = 'ranked'
): Promise<{ ok: boolean; updated: number }> {
  return setAvailability(communityId, gameId, activity, false);
}
