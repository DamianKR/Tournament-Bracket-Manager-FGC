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
 * Offline outbox (misma metodología que tournaments/participants):
 *   - PENDING_RANKED: ids creados localmente no confirmados por el server.
 *     El merge al leer los conserva y los re-empuja en background.
 *   - DELETED_RANKED: tombstones de deletes offline (evitan resurrección).
 *   - syncPendingRankedMatches() se registra en syncRegistry → corre en
 *     cada reconnect ('online') sin recargar la página.
 *
 * OJO schema: el servidor guarda estos records con campos playerAId,
 * playerBId, playerAPointsBefore/After, createdAt (los escribe
 * POST /api/ranking/match). El cliente usa player1Id, player2Id,
 * player1EloBefore/After, date. normalizeMatch() traduce en lectura;
 * toServerBody() traduce en escritura.
 *
 * Ruta de migración:
 *   • Supabase → reemplazar calls al servidor por supabaseGet/supabaseUpsert desde apiClient
 *   • React Native → reemplazar localStorage con AsyncStorage
 */

import { RankedMatch } from '@/models/rankedMatch';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';
import {
  lsReadIdMap,
  markPendingId,
  clearPendingId,
} from '@/services/storage/localStorage';
import { registerOfflineSync } from '@/services/storage/syncRegistry';

const API_BASE = `${SERVER_URL}/api/ranked-matches`;
const LS_KEY = 'bracket_ranked_matches';
const PENDING_RANKED = 'bracket_pending_ranked_matches';
const DELETED_RANKED = 'bracket_deleted_ranked_matches';

// ── Schema translation ────────────────────────────────────────────────────
// Server rows (written by /api/ranking/match) use playerAId/playerAPoints*/
// createdAt; the client model uses player1Id/player1Elo*/date. Normalize
// every record on read so all consumers see the client shape.

interface ServerRankedMatch extends Record<string, unknown> {
  playerAId?: string;
  playerBId?: string;
  matchType?: 'duel' | 'matchmaking' | 'free';
  playerAPointsBefore?: number;
  playerBPointsBefore?: number;
  playerAPointsAfter?: number;
  playerBPointsAfter?: number;
  playerADelta?: number;
  playerBDelta?: number;
  createdAt?: string;
}

function normalizeMatch(m: RankedMatch & ServerRankedMatch): RankedMatch {
  return {
    ...m,
    type: (m.type ?? m.matchType ?? 'free') as RankedMatch['type'],
    player1Id: m.player1Id ?? m.playerAId ?? '',
    player2Id: m.player2Id ?? m.playerBId ?? '',
    player1EloBefore: m.player1EloBefore ?? m.playerAPointsBefore ?? 0,
    player2EloBefore: m.player2EloBefore ?? m.playerBPointsBefore ?? 0,
    player1EloAfter: m.player1EloAfter ?? m.playerAPointsAfter ?? 0,
    player2EloAfter: m.player2EloAfter ?? m.playerBPointsAfter ?? 0,
    player1EloChange: m.player1EloChange ?? m.playerADelta ?? 0,
    player2EloChange: m.player2EloChange ?? m.playerBDelta ?? 0,
    score: typeof m.score === 'string' ? m.score : '',
    date: m.date ?? m.createdAt ?? '',
    communityId: m.communityId || DEFAULT_COMMUNITY_ID,
  };
}

/** Maps a client-shape record to the POST body the server expects. */
function toServerBody(m: RankedMatch): Record<string, unknown> {
  return {
    id: m.id,
    matchType: m.type,
    gameId: m.gameId,
    playerAId: m.player1Id,
    playerBId: m.player2Id,
    winnerId: m.winnerId,
    eloData: {
      playerAEloBefore: m.player1EloBefore,
      playerBEloBefore: m.player2EloBefore,
      playerAEloAfter: m.player1EloAfter,
      playerBEloAfter: m.player2EloAfter,
      playerAEloChange: m.player1EloChange,
      playerBEloChange: m.player2EloChange,
    },
    communityId: m.communityId,
    // Extra detail fields the server route passes through when present
    ...(m.score && { score: m.score }),
    ...(m.player1Score !== undefined && { player1Score: m.player1Score }),
    ...(m.player2Score !== undefined && { player2Score: m.player2Score }),
    ...(m.games && { games: m.games }),
    ...(m.player1Characters && { player1Characters: m.player1Characters }),
    ...(m.player2Characters && { player2Characters: m.player2Characters }),
    ...(m.duelChallengeId && { duelChallengeId: m.duelChallengeId }),
    ...(m.notes && { notes: m.notes }),
    ...(m.date && { createdAt: m.date }),
  };
}

// ── localStorage helpers ──────────────────────────────────────────────────

function lsReadMatches(): RankedMatch[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as (RankedMatch & ServerRankedMatch)[];
    return data.map(normalizeMatch);
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

// ── Outbox push ───────────────────────────────────────────────────────────

/**
 * Push a single match record. Returns:
 *   true      → server confirmed (2xx)
 *   'reject'  → permanent 4xx (validation/auth) — don't retry, drop pending
 *   false     → network/5xx — keep pending, retry on next sync
 */
async function pushMatch(m: RankedMatch): Promise<boolean | 'reject'> {
  if (!(await isServerAvailable())) return false;
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(toServerBody(m)),
    });
    if (res.status === 401) return 'reject';
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) return 'reject';
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[RankedMatches] Server create failed:', err);
    resetServerCache();
    return false;
  }
}

async function deleteMatchOnServer(id: string): Promise<boolean> {
  if (!(await isServerAvailable())) return false;
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    return res.ok || res.status === 404;
  } catch (err) {
    console.warn('[RankedMatches] Server delete failed:', err);
    resetServerCache();
    return false;
  }
}

/**
 * Re-push every match the server never confirmed + retry pending deletes.
 * Registered in syncRegistry → runs on every 'online' reconnect and is also
 * invoked opportunistically from getAllRankedMatchesAsync.
 */
export async function syncPendingRankedMatches(): Promise<number> {
  const pending = lsReadIdMap(PENDING_RANKED);
  const deleted = lsReadIdMap(DELETED_RANKED);
  const pendingIds = Object.keys(pending);
  const deletedIds = Object.keys(deleted);
  if (!pendingIds.length && !deletedIds.length) return 0;
  if (!(await isServerAvailable())) return 0;

  let synced = 0;
  const all = lsReadMatches();

  for (const id of pendingIds) {
    const m = all.find((x) => x.id === id);
    if (!m) { clearPendingId(PENDING_RANKED, id); continue; }
    const result = await pushMatch(m);
    if (result === true) {
      clearPendingId(PENDING_RANKED, id);
      synced++;
    } else if (result === 'reject') {
      // Server said the record shouldn't exist — drop flag; the next
      // merge removes the local-only record since it's not on the server.
      clearPendingId(PENDING_RANKED, id);
      console.warn('[RankedMatches] Pending match rejected by server, dropping:', id);
    }
  }

  for (const id of deletedIds) {
    if (await deleteMatchOnServer(id)) clearPendingId(DELETED_RANKED, id);
  }

  return synced;
}

registerOfflineSync(syncPendingRankedMatches);

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
        const data = ((await res.json()) as (RankedMatch & ServerRankedMatch)[]).map(normalizeMatch);
        const pending = lsReadIdMap(PENDING_RANKED);
        const deleted = lsReadIdMap(DELETED_RANKED);
        const targetCommunity = communityId || null;

        // Server data minus locally-tombstoned ids
        const serverSlice = data.filter((m) => !deleted[m.id]);
        const serverIds = new Set(data.map((m) => m.id));

        // Local-only records that are still pending push survive the merge
        // (otherwise an offline-created match would vanish on the next read)
        const localOnlyPending = lsReadMatches().filter(
          (m) =>
            pending[m.id] &&
            !serverIds.has(m.id) &&
            !deleted[m.id] &&
            (!targetCommunity || m.communityId === targetCommunity)
        );
        const mergedSlice = [...serverSlice, ...localOnlyPending];

        // Merge this community slice into cache instead of overwriting all.
        if (communityId) {
          const others = lsReadMatches().filter((m) => m.communityId !== communityId);
          lsWriteMatches([...others, ...mergedSlice]);
        } else {
          // No scope: server is the full source of truth + pending locals
          lsWriteMatches(mergedSlice);
        }

        // Background: flush the outbox (pending creates + tombstoned deletes)
        syncPendingRankedMatches().catch(() => {});

        return mergedSlice.length > 0 ? mergedSlice : cached;
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

/**
 * Crea una partida ranked.
 * NOTA: el path normal de escritura es rankingService.recordMatch() (server
 * calcula ELO transaccionalmente). Esta función existe para writes directos
 * y ahora también es segura offline: el record queda pending y se re-empuja
 * en el próximo sync.
 */
export async function createRankedMatch(
  matchType: 'duel' | 'matchmaking',
  gameId: string,
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
    gameId,
    player1Id,
    player2Id,
    winnerId,
    score: '',
    ...eloData,
    date: new Date().toISOString(),
    duelChallengeId,
    communityId,
  };

  // Guardar en localStorage primero (instantáneo) + marcar pending
  const all = lsReadMatches();
  all.push(match);
  lsWriteMatches(all);
  markPendingId(PENDING_RANKED, match.id);

  // Sincronizar con servidor
  const result = await pushMatch(match);
  if (result === true) {
    clearPendingId(PENDING_RANKED, match.id);
  } else if (result === 'reject') {
    clearPendingId(PENDING_RANKED, match.id);
    lsWriteMatches(lsReadMatches().filter((m) => m.id !== match.id));
    return null;
  }

  return match;
}

/** Elimina una partida ranked. */
export async function deleteRankedMatch(id: string): Promise<boolean> {
  const all = lsReadMatches();
  const filtered = all.filter(m => m.id !== id);

  if (filtered.length === all.length) return false;

  lsWriteMatches(filtered);
  // Tombstone: if the server delete can't run now, retry on next sync so
  // the record doesn't resurrect from the server-side copy.
  clearPendingId(PENDING_RANKED, id);
  markPendingId(DELETED_RANKED, id);

  if (await deleteMatchOnServer(id)) {
    clearPendingId(DELETED_RANKED, id);
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
