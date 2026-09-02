/**
 * Ranked Match Service — 3-layer persistence (JSON primero + localStorage cache)
 *
 * Prioridad LECTURA:
 *   1. Servidor JSON local  (http://localhost:3001/api/ranked-matches)
 *   2. localStorage cache
 *
 * Prioridad ESCRITURA:
 *   1. localStorage (síncrono, instantáneo)
 *   2. Servidor JSON local (async, fire-and-forget)
 *
 * Ruta de migración:
 *   • Supabase → reemplazar calls al servidor por supabaseGet/supabaseUpsert desde apiClient
 *   • React Native → reemplazar localStorage con AsyncStorage
 */

import { RankedMatch } from '@/models/rankedMatch';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';

const API_BASE = `${SERVER_URL}/api/ranked-matches`;
const LS_KEY = 'bracket_ranked_matches';

// ── localStorage helpers ──────────────────────────────────────────────────

function lsReadMatches(): RankedMatch[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as RankedMatch[];
    return data.map((m) => ({
      ...m,
      communityId: m.communityId || DEFAULT_COMMUNITY_ID,
    }));
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

/** Obtiene todas las partidas ranked (sync desde localStorage). */
export function getAllRankedMatches(communityId?: string): RankedMatch[] {
  const all = lsReadMatches();
  return communityId ? all.filter(m => m.communityId === communityId) : all;
}

/** Obtiene todas las partidas ranked (async desde servidor, fallback a localStorage). */
export async function getAllRankedMatchesAsync(communityId?: string): Promise<RankedMatch[]> {
  const cached = getAllRankedMatches(communityId);
  const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${API_BASE}${query}`);
      if (res.ok) {
        const data = await res.json();
        // Merge this community slice into cache instead of overwriting all.
        if (communityId) {
          const all = lsReadMatches();
          const others = all.filter(m => m.communityId !== communityId);
          lsWriteMatches([...others, ...data]);
        } else if (data.length > 0 || lsReadMatches().length === 0) {
          lsWriteMatches(data);
        }
        return data.length > 0 ? data : cached;
      }
    } catch (err) {
      console.warn('[RankedMatches] Server read failed:', err);
      resetServerCache();
    }
  }
  return cached;
}

/** Obtiene una partida ranked por ID. */
export async function getRankedMatch(id: string, communityId?: string): Promise<RankedMatch | null> {
  const all = await getAllRankedMatchesAsync(communityId);
  return all.find(m => m.id === id) ?? null;
}

/** Crea una nueva partida ranked. */
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
  duelChallengeId?: string,
  communityId?: string
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
    communityId,
  };

  // Guardar en localStorage primero (instantáneo)
  const all = lsReadMatches();
  all.push(match);
  lsWriteMatches(all);

  // Sincronizar con servidor
  if (await isServerAvailable()) {
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

/** Elimina una partida ranked. */
export async function deleteRankedMatch(id: string): Promise<boolean> {
  const all = lsReadMatches();
  const filtered = all.filter(m => m.id !== id);

  if (filtered.length === all.length) return false;

  lsWriteMatches(filtered);

  if (await isServerAvailable()) {
    fetch(`${API_BASE}/${id}`, { method: 'DELETE' }).catch((err) => {
      console.warn('[RankedMatches] Server delete failed:', err);
      resetServerCache();
    });
  }

  return true;
}

/** Obtiene partidas ranked de un jugador específico. */
export async function getPlayerRankedMatches(playerId: string, communityId?: string): Promise<RankedMatch[]> {
  const all = await getAllRankedMatchesAsync(communityId);
  return all.filter(m => m.player1Id === playerId || m.player2Id === playerId);
}

/** Obtiene partidas ranked por tipo. */
export async function getRankedMatchesByType(matchType: 'duel' | 'matchmaking', communityId?: string): Promise<RankedMatch[]> {
  const all = await getAllRankedMatchesAsync(communityId);
  return all.filter(m => m.type === matchType);
}
