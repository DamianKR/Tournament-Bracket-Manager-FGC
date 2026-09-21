/**
 * Storage Service — 3-layer persistence
 *
 * Priority for READS:
 *   1. Local JSON server (http://localhost:3001) — when running via Abrir_Aplicacion.bat
 *   2. localStorage                              — always available in the browser
 *
 * Priority for WRITES:
 *   1. localStorage  (synchronous, instant, never fails)
 *   2. Local JSON server (async, fire-and-forget if not running)
 *   3. Supabase (future — slot is ready, just add env vars)
 *
 * The local server is optional — the app works fine without it,
 * falling back to localStorage automatically.
 *
 * Covers two collections:
 *   - Tournaments       (STORAGE_KEYS.TOURNAMENTS  / /api/tournaments)
 *   - GlobalParticipants (STORAGE_KEYS.PARTICIPANTS / /api/participants)
 */

import { Tournament, GlobalParticipant } from '@/models/types';
import { STORAGE_KEYS } from '@/constants/tournament';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import {
  SERVER_URL,
  isServerAvailable,
  resetServerCache,
  hasSupabase,
  supabaseGet,
  supabaseUpsert,
} from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';
import { migrateParticipantGames } from '@/utils/participantGames';

// ── Auth expiry helper ──────────────────────────────────────────────────
// Si un write autenticado recibe 401, notificamos al contexto de auth para
// que muestre el banner de "sesión expirada" sin bloquear el flujo.
function dispatchAuthExpired(): void {
  try { window.dispatchEvent(new Event('auth:expired')); } catch {}
}

async function authedFetch(url: string, options: RequestInit): Promise<void> {
  try {
    const res = await fetch(url, options);
    if (res.status === 401) {
      console.warn('[Storage] Write rejected with 401 — session expired:', url);
      dispatchAuthExpired();
    } else if (!res.ok) {
      console.warn('[Storage] Write failed:', res.status, url);
    }
  } catch (err) {
    console.warn('[Storage] Write network error:', url, err);
    resetServerCache();
  }
}

// ── Supabase helpers específicos de esta colección ───────────────────────
// Los stubs genéricos viven en apiClient; aquí solo wrapeamos con los tipos.

async function _supabaseLoadTournaments(): Promise<Tournament[] | null> {
  return supabaseGet<Tournament[]>('tournaments');
}
async function _supabaseSyncTournaments(data: Tournament[]): Promise<void> {
  await supabaseUpsert('tournaments', data);
}
async function _supabaseLoadParticipants(): Promise<GlobalParticipant[] | null> {
  return supabaseGet<GlobalParticipant[]>('participants');
}
async function _supabaseSyncParticipants(data: GlobalParticipant[]): Promise<void> {
  await supabaseUpsert('participants', data);
}

// ══════════════════════════════════════════════════════════════════════════
//  TOURNAMENTS
// ══════════════════════════════════════════════════════════════════════════

function lsReadTournaments(): Tournament[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TOURNAMENTS);
    if (!raw) return [];
    const data = JSON.parse(raw) as Tournament[];
    return data.map((t) => ({
      ...t,
      communityId: t.communityId || DEFAULT_COMMUNITY_ID,
    }));
  } catch {
    return [];
  }
}

function lsWriteTournaments(data: Tournament[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TOURNAMENTS, JSON.stringify(data));
  } catch (err) {
    console.error('[Storage] localStorage tournaments write failed:', err);
  }
}

function filterByCommunityId<T extends { communityId?: string }>(items: T[], communityId?: string): T[] {
  if (!communityId) return items;
  return items.filter((i) => i.communityId === communityId);
}

async function readAllTournaments(communityId?: string): Promise<Tournament[]> {
  if (await isServerAvailable()) {
    try {
      const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
      const res = await fetch(`${SERVER_URL}/api/tournaments${query}`);
      if (res.ok) {
        const data = (await res.json()) as Tournament[];
        // Only overwrite localStorage if server has data OR localStorage is also empty.
        // This prevents wiping localStorage on a fresh server with no data yet.
        if (data.length > 0 || lsReadTournaments().length === 0) {
          // Merge instead of blind overwrite: a local tournament that is newer
          // than the server copy has unsynced changes (e.g. a seeding PUT that
          // was still in flight or was rejected). Keep it and re-push.
          const serverMap = new Map(data.map((t) => [t.id, t]));
          const merged = [...data];
          for (const lt of lsReadTournaments()) {
            const st = serverMap.get(lt.id);
            const localIsNewer = st && new Date(lt.updatedAt).getTime() > new Date(st.updatedAt).getTime();
            if (!st || localIsNewer) {
              if (st) merged[merged.indexOf(st)] = lt; else merged.push(lt);
              writeOneTournament(lt).catch((err) =>
                console.warn('[Storage] Re-sync of local tournament failed:', err)
              );
            }
          }
          lsWriteTournaments(merged);
          return filterByCommunityId(merged, communityId);
        }
        return filterByCommunityId(lsReadTournaments(), communityId);
      }
    } catch (err) {
      console.warn('[Storage] Local server tournaments read failed:', err);
      resetServerCache();
    }
  }
  if (hasSupabase()) {
    const data = await _supabaseLoadTournaments();
    if (data) { lsWriteTournaments(data); return filterByCommunityId(data, communityId); }
  }
  return filterByCommunityId(lsReadTournaments(), communityId);
}

async function writeAllTournaments(data: Tournament[]): Promise<void> {
  lsWriteTournaments(data);
  if (await isServerAvailable()) {
    authedFetch(`${SERVER_URL}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
  }
  if (hasSupabase()) {
    _supabaseSyncTournaments(data).catch((err) =>
      console.warn('[Storage] Supabase tournaments sync failed:', err)
    );
  }
}

// Write a single tournament via PUT (more efficient than bulk POST).
// Unlike authedFetch, this AWAITS the response and THROWS on server-side
// errors (4xx/5xx) so callers like saveTournamentAsync can surface them.
// Pure network failures (fetch TypeError) are swallowed so the app keeps
// working in localStorage-only mode when the server is unreachable.
async function writeOneTournament(tournament: Tournament): Promise<void> {
  if (await isServerAvailable()) {
    let res: Response;
    try {
      res = await fetch(`${SERVER_URL}/api/tournaments/${encodeURIComponent(tournament.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(tournament),
      });
    } catch (networkErr) {
      // Server unreachable — continue in localStorage-only mode, do not throw.
      console.warn('[Storage] Write network error (offline mode):', networkErr);
      resetServerCache();
      return;
    }
    if (res.status === 401) {
      console.warn('[Storage] Write rejected with 401 — session expired');
      dispatchAuthExpired();
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { error?: string }).error ?? `Server rejected tournament save (${res.status})`;
      console.warn('[Storage] Write failed:', res.status, msg);
      throw new Error(msg);
    }
  }
  if (hasSupabase()) {
    _supabaseSyncTournaments([tournament]).catch((err) =>
      console.warn('[Storage] Supabase tournament sync failed:', err)
    );
  }
}

// ── Tournaments public API ──────────────────────────────────────────────

export function loadTournaments(): Tournament[] {
  return lsReadTournaments();
}

export async function loadTournamentsAsync(communityId?: string): Promise<Tournament[]> {
  return readAllTournaments(communityId);
}

export async function loadTournamentsForParticipantAsync(participantId: string): Promise<Tournament[]> {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${SERVER_URL}/api/participants/${encodeURIComponent(participantId)}/tournaments`);
      if (res.ok) return (await res.json()) as Tournament[];
    } catch (err) {
      console.warn('[Storage] Local server participant tournaments read failed:', err);
      resetServerCache();
    }
  }
  const all = lsReadTournaments();
  const p = (lsReadParticipants() as GlobalParticipant[]).find((x) => x.id === participantId);
  const ids = new Set(p?.tournamentIds ?? []);
  return all.filter((t) => ids.has(t.id));
}

export function saveTournaments(tournaments: Tournament[]): void {
  lsWriteTournaments(tournaments);
  writeAllTournaments(tournaments).catch((err) =>
    console.warn('[Storage] Background tournaments write error:', err)
  );
}

export function saveTournament(tournament: Tournament): void {
  const all = lsReadTournaments();
  const idx = all.findIndex((t) => t.id === tournament.id);
  if (idx >= 0) { all[idx] = tournament; } else { all.push(tournament); }
  lsWriteTournaments(all);
  writeOneTournament(tournament).catch((err) =>
    console.warn('[Storage] Background tournament write error:', err)
  );
}

export async function saveTournamentAsync(tournament: Tournament): Promise<void> {
  const all = lsReadTournaments();
  const idx = all.findIndex((t) => t.id === tournament.id);
  // Keep the previous state so we can rollback on server rejection.
  const previous = idx >= 0 ? all[idx] : null;
  if (idx >= 0) { all[idx] = tournament; } else { all.push(tournament); }
  lsWriteTournaments(all);
  try {
    await writeOneTournament(tournament);
  } catch (serverErr) {
    // Server explicitly rejected the save (e.g., 403 inactive player).
    // Rollback localStorage so client state stays in sync with the server.
    const rollbackAll = lsReadTournaments();
    const rollbackIdx = rollbackAll.findIndex((t) => t.id === tournament.id);
    if (previous && rollbackIdx >= 0) {
      rollbackAll[rollbackIdx] = previous;
    } else if (!previous && rollbackIdx >= 0) {
      rollbackAll.splice(rollbackIdx, 1);
    }
    lsWriteTournaments(rollbackAll);
    throw serverErr;
  }
}

export function loadTournament(id: string): Tournament | null {
  return lsReadTournaments().find((t) => t.id === id) ?? null;
}

/**
 * Write a tournament to the localStorage cache ONLY — no server PUT.
 * Used to store server-authoritative responses (e.g. self-registration via
 * POST /api/tournaments/:id/register) so we don't echo the write back.
 */
export function cacheTournament(tournament: Tournament): void {
  const all = lsReadTournaments();
  const idx = all.findIndex((t) => t.id === tournament.id);
  if (idx >= 0) { all[idx] = tournament; } else { all.push(tournament); }
  lsWriteTournaments(all);
}

export function deleteTournament(id: string): void {
  const filtered = lsReadTournaments().filter((t) => t.id !== id);
  lsWriteTournaments(filtered);
  isServerAvailable().then((available) => {
    if (available) {
      fetch(`${SERVER_URL}/api/tournaments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      }).catch((err) => { console.warn('[Storage] Local server tournament delete failed:', err); resetServerCache(); });
    }
  });
  if (hasSupabase()) {
    _supabaseSyncTournaments(filtered).catch((err) =>
      console.warn('[Storage] Supabase tournament delete sync failed:', err)
    );
  }
}

export function clearAllTournaments(): void {
  localStorage.removeItem(STORAGE_KEYS.TOURNAMENTS);
  writeAllTournaments([]).catch(() => {});
}

export function getTournamentCount(): number {
  return lsReadTournaments().length;
}

export function tournamentExists(id: string): boolean {
  return lsReadTournaments().some((t) => t.id === id);
}

// ══════════════════════════════════════════════════════════════════════════
//  GLOBAL PARTICIPANTS
// ══════════════════════════════════════════════════════════════════════════

function lsReadParticipants(): GlobalParticipant[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PARTICIPANTS);
    if (!raw) return [];
    const data = JSON.parse(raw) as GlobalParticipant[];
    // Migrate old records missing new fields and convert legacy ELO to per-game
    return data.map((p) => {
      const normalized: GlobalParticipant = {
        ...p,
        gameId: p.gameId ?? null,
        mainCharacterId: p.mainCharacterId ?? null,
        games: p.games ?? {},
        tournamentIds: p.tournamentIds ?? [],
        communityId: p.communityId || DEFAULT_COMMUNITY_ID,
      };
      return migrateParticipantGames(normalized);
    });
  } catch {
    return [];
  }
}

function lsWriteParticipants(data: GlobalParticipant[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(data));
  } catch (err) {
    console.error('[Storage] localStorage participants write failed:', err);
  }
}

async function readAllParticipants(communityId?: string): Promise<GlobalParticipant[]> {
  const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${SERVER_URL}/api/participants${query}`);
      if (res.ok) {
        const data = (await res.json()) as GlobalParticipant[];
        // Merge this community slice into the cache instead of replacing everything.
        if (communityId) {
          const existing = lsReadParticipants();
          const others = existing.filter((p) => p.communityId !== communityId);
          lsWriteParticipants([...others, ...data]);
        } else if (data.length > 0 || lsReadParticipants().length === 0) {
          lsWriteParticipants(data);
        }
        return data.length > 0 ? data : lsReadParticipants().filter((p) => !communityId || p.communityId === communityId);
      }
    } catch (err) {
      console.warn('[Storage] Local server participants read failed:', err);
      resetServerCache();
    }
  }
  if (hasSupabase()) {
    const data = await _supabaseLoadParticipants();
    if (data) { lsWriteParticipants(data); return data; }
  }
  const cached = lsReadParticipants();
  return communityId ? cached.filter((p) => p.communityId === communityId) : cached;
}

// Exactamente igual que writeAllTournaments pero para participants
async function writeAllParticipants(data: GlobalParticipant[]): Promise<void> {
  lsWriteParticipants(data);
  if (await isServerAvailable()) {
    authedFetch(`${SERVER_URL}/api/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
  }
  if (hasSupabase()) {
    _supabaseSyncParticipants(data).catch((err) =>
      console.warn('[Storage] Supabase participants sync failed:', err)
    );
  }
}

// ── GlobalParticipants public API ───────────────────────────────────────

export function loadGlobalParticipants(communityId?: string): GlobalParticipant[] {
  const all = lsReadParticipants();
  return communityId ? all.filter((p) => p.communityId === communityId) : all;
}

export async function loadGlobalParticipantsAsync(communityId?: string): Promise<GlobalParticipant[]> {
  return readAllParticipants(communityId);
}

export async function saveGlobalParticipants(data: GlobalParticipant[]): Promise<void> {
  lsWriteParticipants(data);
  try {
    await writeAllParticipants(data);
  } catch (err) {
    console.warn('[Storage] Background participants write error:', err);
  }
}

export async function saveGlobalParticipant(p: GlobalParticipant): Promise<void> {
  const all = lsReadParticipants();
  const idx = all.findIndex((x) => x.id === p.id);
  if (idx >= 0) { all[idx] = p; } else { all.push(p); }
  lsWriteParticipants(all);

  if (await isServerAvailable()) {
    authedFetch(`${SERVER_URL}/api/participants/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(p),
    });
  }

  if (hasSupabase()) {
    _supabaseSyncParticipants([p]).catch((err) =>
      console.warn('[Storage] Supabase participant sync failed:', err)
    );
  }
}

export async function deleteGlobalParticipant(id: string): Promise<void> {
  const filtered = lsReadParticipants().filter((p) => p.id !== id);
  lsWriteParticipants(filtered);
  if (await isServerAvailable()) {
    const res = await fetch(`${SERVER_URL}/api/participants/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Failed to delete participant on server');
    }
  }
  if (hasSupabase()) {
    _supabaseSyncParticipants(filtered).catch((err) =>
      console.warn('[Storage] Supabase participant delete sync failed:', err)
    );
  }
}

// Adds a tournamentId to the participant's FK list (bidirectional link)
export async function linkParticipantToTournament(participantId: string, tournamentId: string): Promise<void> {
  const all = lsReadParticipants();
  const p = all.find((x) => x.id === participantId);
  if (p && !p.tournamentIds.includes(tournamentId)) {
    p.tournamentIds.push(tournamentId);
    p.updatedAt = new Date().toISOString();
    lsWriteParticipants(all);
    await saveGlobalParticipant(p);
  }
}

export function findGlobalParticipantByName(name: string, communityId?: string): GlobalParticipant | null {
  return lsReadParticipants().find(
    (p) =>
      (!communityId || p.communityId === communityId) &&
      p.name.toLowerCase() === name.trim().toLowerCase()
  ) ?? null;
}

export function searchGlobalParticipants(query: string): GlobalParticipant[] {
  const q = query.trim().toLowerCase();
  const all = lsReadParticipants().filter((p) =>
    p.name.toLowerCase().includes(q) || p.alias?.toLowerCase().includes(q)
  );
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
