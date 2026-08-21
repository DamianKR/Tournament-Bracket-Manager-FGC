/**
 * Ranked Match Service — 3-layer persistence (JSON first + localStorage cache)
 *
 * Priority for READS:
 *   1. Local JSON server (http://localhost:3001/api/ranked-matches)
 *   2. localStorage cache
 *
 * Priority for WRITES:
 *   1. localStorage (synchronous, instant)
 *   2. Local JSON server (async, fire-and-forget)
 */

import { RankedMatch } from '@/models/rankedMatch';

const API_BASE = 'http://localhost:3001/api/ranked-matches';
const LS_KEY = 'bracket_ranked_matches';
const HEALTH_TIMEOUT_MS = 1500;

let _healthPromise: Promise<boolean> | null = null;

function isLocalServerAvailable(): Promise<boolean> {
  if (_healthPromise) return _healthPromise;
  _healthPromise = fetch(API_BASE, {
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  })
    .then((res) => res.ok)
    .catch(() => false);
  return _healthPromise;
}

function resetServerCache() {
  _healthPromise = null;
}

// ── localStorage helpers ──────────────────────────────────────────────────

function lsReadMatches(): RankedMatch[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function lsWriteMatches(data: RankedMatch[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('[RankedMatches] localStorage write failed:', err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Get all ranked matches (sync from localStorage)
 */
export function getAllRankedMatches(): RankedMatch[] {
  return lsReadMatches();
}

/**
 * Get all ranked matches (async from server, fallback to localStorage)
 */
export async function getAllRankedMatchesAsync(): Promise<RankedMatch[]> {
  if (await isLocalServerAvailable()) {
    try {
      const res = await fetch(API_BASE);
      if (res.ok) {
        const data = await res.json();
        // Only overwrite cache if server has data OR cache is empty
        if (data.length > 0 || lsReadMatches().length === 0) {
          lsWriteMatches(data);
        }
        return data.length > 0 ? data : lsReadMatches();
      }
    } catch (err) {
      console.warn('[RankedMatches] Server read failed:', err);
      resetServerCache();
    }
  }
  return lsReadMatches();
}

/**
 * Get a single ranked match by ID
 */
export async function getRankedMatch(id: string): Promise<RankedMatch | null> {
  const all = await getAllRankedMatchesAsync();
  return all.find(m => m.id === id) ?? null;
}

/**
 * Create a new ranked match
 */
export async function createRankedMatch(
  matchType: 'duel' | 'matchmaking',
  player1Id: string,
  player2Id: string,
  winnerId: string,
  eloData: {
    player1EloBefore: number;
    player2EloBefore: number;
    player1EloAfter: number;
    player2EloAfter: number;
    player1EloChange: number;
    player2EloChange: number;
  },
  duelChallengeId?: string
): Promise<RankedMatch | null> {
  const match: RankedMatch = {
    id: `ranked_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: matchType,
    player1Id,
    player2Id,
    winnerId,
    score: '',
    ...eloData,
    date: new Date().toISOString(),
    duelChallengeId,
  };

  // Add to localStorage cache
  const all = lsReadMatches();
  all.push(match);
  lsWriteMatches(all);

  // Sync to server
  if (await isLocalServerAvailable()) {
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(match),
      });
      if (!res.ok) throw new Error('Server rejected match');
    } catch (err) {
      console.warn('[RankedMatches] Server create failed:', err);
      resetServerCache();
    }
  }

  return match;
}

/**
 * Delete a ranked match
 */
export async function deleteRankedMatch(id: string): Promise<boolean> {
  const all = lsReadMatches();
  const filtered = all.filter(m => m.id !== id);
  
  if (filtered.length === all.length) return false; // Not found
  
  // Update localStorage
  lsWriteMatches(filtered);

  // Sync to server
  if (await isLocalServerAvailable()) {
    fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
    }).catch((err) => {
      console.warn('[RankedMatches] Server delete failed:', err);
      resetServerCache();
    });
  }

  return true;
}

/**
 * Get ranked matches for a specific player
 */
export async function getPlayerRankedMatches(playerId: string): Promise<RankedMatch[]> {
  const all = await getAllRankedMatchesAsync();
  return all.filter(m => m.player1Id === playerId || m.player2Id === playerId);
}

/**
 * Get ranked matches by type
 */
export async function getRankedMatchesByType(matchType: 'duel' | 'matchmaking'): Promise<RankedMatch[]> {
  const all = await getAllRankedMatchesAsync();
  return all.filter(m => m.type === matchType);
}
