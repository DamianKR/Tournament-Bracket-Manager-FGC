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

import type { MatchRecord, GlobalParticipant } from '../../models/types';
import { SERVER_URL } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';

// ── localStorage sync helpers ─────────────────────────────────────────────

const LS_PARTICIPANTS_KEY = 'bracket_global_participants';

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

/** Fetches the leaderboard for a specific game sorted by ELO descending. */
export async function getLeaderboard(communityId?: string, gameId?: string): Promise<LeaderboardEntry[]> {
  const query = buildQuery({ communityId, gameId: gameId ?? '' });
  const res = await fetch(`${API_BASE}${query}`);
  if (!res.ok) throw new Error(`Failed to load leaderboard: ${res.status}`);
  return res.json();
}

/** Fetches full match history (newest first). */
export async function getAllMatches(communityId?: string, gameId?: string): Promise<MatchRecord[]> {
  const query = buildQuery({ communityId, gameId: gameId ?? '' });
  const res = await fetch(`${API_BASE}/matches${query}`);
  if (!res.ok) throw new Error(`Failed to load matches: ${res.status}`);
  return res.json();
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
 */
export async function recordMatch(
  playerAId: string,
  playerBId: string,
  winnerId: string,
  gameId: string,
  matchType: 'duel' | 'matchmaking' | 'free' = 'free',
  communityId?: string
): Promise<MatchResult> {
  const res = await fetch(`${API_BASE}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ playerAId, playerBId, winnerId, gameId, matchType, communityId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to record match: ${res.status}`);
  }
  const data = await res.json();
  // Patch localStorage with the updated ELO values from the server
  const toSync: GlobalParticipant[] = [
    data.updatedParticipantA,
    data.updatedParticipantB,
  ].filter(Boolean) as GlobalParticipant[];
  if (toSync.length) lsPatchParticipants(toSync);
  return data as MatchResult;
}

/** Deletes a match record. Does NOT revert ELO. */
export async function deleteMatch(matchId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/matches/${matchId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete match: ${res.status}`);
}

/** Hard reset: all participants → 1500 pts for a game. Clears match history. Syncs localStorage. */
export async function hardResetRanking(communityId?: string, gameId?: string): Promise<{ affectedParticipants: number }> {
  const body: Record<string, string> = {};
  if (communityId) body.communityId = communityId;
  if (gameId) body.gameId = gameId;
  const res = await fetch(`${API_BASE}/reset/hard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Soft reset failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data.updatedParticipants)) {
    lsPatchParticipants(data.updatedParticipants as GlobalParticipant[]);
  }
  return data;
}


