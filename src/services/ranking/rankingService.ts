/**
 * Ranking Service — Frontend
 *
 * Communicates with the local Express API for all ELO ranking operations.
 * All functions throw on network error; callers should handle gracefully.
 */

import type { MatchRecord } from '../../models/types';

const API_BASE = 'http://localhost:3001/api/ranking';

// ── Types ─────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  position: number;
  id: string;
  name: string;
  alias: string;
  avatarUrl: string | null;
  eloPoints: number;
  eloRank: string;
  displayRank: string;   // 'Legend' for top 5, otherwise same as eloRank
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
  Plata:      '#94a3b8',
  Oro:        '#f59e0b',
  Platino:    '#06b6d4',
  Diamante:   '#6366f1',
  Vanquisher: '#8b5cf6',
  Master:     '#ec4899',
  Ultimate:   '#f97316',
  Legend:     '#ef4444',
};

export function getRankColor(rank: string): string {
  return RANK_COLORS[rank] ?? '#94a3b8';
}

export function getRankIcon(rank: string): string {
  const icons: Record<string, string> = {
    Plata:      '🥈',
    Oro:        '🥇',
    Platino:    '💎',
    Diamante:   '💠',
    Vanquisher: '⚔️',
    Master:     '👑',
    Ultimate:   '🔥',
    Legend:     '⭐',
  };
  return icons[rank] ?? '🎮';
}

// ── API calls ─────────────────────────────────────────────────────────────

/** Fetches the full leaderboard sorted by ELO descending. */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error(`Failed to load leaderboard: ${res.status}`);
  return res.json();
}

/** Fetches full match history (newest first). */
export async function getAllMatches(): Promise<MatchRecord[]> {
  const res = await fetch(`${API_BASE}/matches`);
  if (!res.ok) throw new Error(`Failed to load matches: ${res.status}`);
  return res.json();
}

/** Fetches match history for a single participant. */
export async function getMatchesForParticipant(participantId: string): Promise<MatchRecord[]> {
  const res = await fetch(`${API_BASE}/matches/${participantId}`);
  if (!res.ok) throw new Error(`Failed to load matches: ${res.status}`);
  return res.json();
}

/**
 * Records a match and updates ELO for both players.
 * @param playerAId  - First participant ID
 * @param playerBId  - Second participant ID
 * @param winnerId   - Must be one of the two player IDs
 */
export async function recordMatch(
  playerAId: string,
  playerBId: string,
  winnerId: string
): Promise<MatchResult> {
  const res = await fetch(`${API_BASE}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerAId, playerBId, winnerId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to record match: ${res.status}`);
  }
  return res.json();
}

/** Deletes a match record. Does NOT revert ELO. */
export async function deleteMatch(matchId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/matches/${matchId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete match: ${res.status}`);
}
