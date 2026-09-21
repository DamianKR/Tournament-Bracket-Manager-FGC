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

// ── Outbox helpers (pending-sync flags + tombstones) ────────────────────
// Records changed locally are flagged "pending" until the server confirms
// the write. Pending always beats the server copy on merge — timestamps are
// only a fallback, because a server-side write can look newer than a local
// change that never reached the server (offline mode).
// Tombstones track ids deleted locally so the deletion propagates instead
// of the record resurrecting on the next sync.

function lsReadIdMap(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function lsWriteIdMap(key: string, map: Record<string, string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch (err) {
    console.error('[Storage] outbox write failed:', err);
  }
}

function markPendingId(key: string, id: string): void {
  const m = lsReadIdMap(key);
  m[id] = new Date().toISOString();
  lsWriteIdMap(key, m);
}

function clearPendingId(key: string, id: string): void {
  const m = lsReadIdMap(key);
  if (id in m) {
    delete m[id];
    lsWriteIdMap(key, m);
  }
}

async function deleteOnServer(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}${path}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    return res.ok || res.status === 404;
  } catch {
    resetServerCache();
    return false;
  }
}

// ── Sync baselines & conflicts (Steam-style local-vs-server choice) ─────
// baseline[id] = the server copy's updatedAt as of the last confirmed sync.
// A REAL conflict needs BOTH sides changed: local record is pending AND
// server.updatedAt differs from the baseline. Pending with an unchanged
// server silently re-pushes; no pending means the server copy wins silently.

export interface SyncConflictEntry {
  id: string;
  kind: 'tournament' | 'participant';
  name: string;
  localUpdatedAt: string | null;
  serverUpdatedAt: string | null;
  serverRecord: unknown; // snapshot of the server version for "use server" restore
  detectedAt: string;
}

function setBaseline(key: string, id: string, updatedAt: string | null | undefined): void {
  const m = lsReadIdMap(key);
  m[id] = updatedAt ?? '';
  lsWriteIdMap(key, m);
}

function removeBaseline(key: string, id: string): void {
  clearPendingId(key, id); // same map shape — reuse the delete helper
}

function lsReadConflicts(): Record<string, SyncConflictEntry> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SYNC_CONFLICTS) ?? '{}');
  } catch {
    return {};
  }
}

function lsWriteConflicts(map: Record<string, SyncConflictEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_CONFLICTS, JSON.stringify(map));
  } catch (err) {
    console.error('[Storage] sync conflicts write failed:', err);
  }
}

function addSyncConflict(entry: SyncConflictEntry): void {
  const map = lsReadConflicts();
  map[entry.id] = entry;
  lsWriteConflicts(map);
}

function dispatchSyncConflicts(): void {
  try {
    const count = Object.keys(lsReadConflicts()).length;
    if (count > 0) {
      window.dispatchEvent(new CustomEvent('sync:conflict', { detail: { count } }));
    }
  } catch {}
}

/** All pending local-vs-server conflicts awaiting user resolution. */
export function getSyncConflicts(): SyncConflictEntry[] {
  return Object.values(lsReadConflicts());
}

/**
 * Resolve a sync conflict.
 * 'local'  — push the local version to the server (keeps your offline work).
 * 'server' — discard local changes and take the server snapshot.
 */
export async function resolveSyncConflict(id: string, choice: 'local' | 'server'): Promise<boolean> {
  const conflicts = lsReadConflicts();
  const entry = conflicts[id];
  if (!entry) return true;

  if (entry.kind === 'tournament') {
    if (choice === 'local') {
      const local = lsReadTournaments().find((t) => t.id === id);
      if (!local) { delete conflicts[id]; lsWriteConflicts(conflicts); return true; }
      const ok = await writeOneTournament(local);
      if (!ok) return false; // keep conflict — retry later
      clearPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, id);
      setBaseline(STORAGE_KEYS.SYNCED_TOURNAMENTS, id, local.updatedAt);
    } else {
      const server = entry.serverRecord as Tournament;
      const all = lsReadTournaments();
      const idx = all.findIndex((t) => t.id === id);
      if (idx >= 0) all[idx] = server; else all.push(server);
      lsWriteTournaments(all);
      clearPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, id);
      setBaseline(STORAGE_KEYS.SYNCED_TOURNAMENTS, id, server.updatedAt);
    }
  } else {
    if (choice === 'local') {
      const local = lsReadParticipants().find((p) => p.id === id);
      if (!local) { delete conflicts[id]; lsWriteConflicts(conflicts); return true; }
      const ok = await putParticipant(local);
      if (!ok) return false;
      clearPendingId(STORAGE_KEYS.PENDING_PARTICIPANTS, id);
      setBaseline(STORAGE_KEYS.SYNCED_PARTICIPANTS, id, local.updatedAt);
    } else {
      const server = entry.serverRecord as GlobalParticipant;
      const all = lsReadParticipants();
      const idx = all.findIndex((p) => p.id === id);
      if (idx >= 0) all[idx] = server; else all.push(server);
      lsWriteParticipants(all);
      clearPendingId(STORAGE_KEYS.PENDING_PARTICIPANTS, id);
      setBaseline(STORAGE_KEYS.SYNCED_PARTICIPANTS, id, server.updatedAt);
    }
  }

  delete conflicts[id];
  lsWriteConflicts(conflicts);
  return true;
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
        const pending = lsReadIdMap(STORAGE_KEYS.PENDING_TOURNAMENTS);
        const deleted = lsReadIdMap(STORAGE_KEYS.DELETED_TOURNAMENTS);
        const baseline = lsReadIdMap(STORAGE_KEYS.SYNCED_TOURNAMENTS);
        const serverMap = new Map(data.map((t) => [t.id, t]));
        const merged = [...data];
        let foundConflict = false;

        // Merge: pending local records win and re-push — UNLESS the server
        // copy also moved since our last sync (real conflict → ask the user).
        for (const lt of lsReadTournaments()) {
          if (deleted[lt.id]) continue; // tombstoned — handled below
          const st = serverMap.get(lt.id);
          const isPending = !!pending[lt.id];
          const serverMoved = !!st &&
            st.updatedAt !== baseline[lt.id] && st.updatedAt !== lt.updatedAt;
          if (isPending && serverMoved) {
            // Both sides changed — keep local so nothing is lost, ask later.
            merged[merged.indexOf(st!)] = lt;
            addSyncConflict({
              id: lt.id,
              kind: 'tournament',
              name: lt.name,
              localUpdatedAt: lt.updatedAt ?? null,
              serverUpdatedAt: st!.updatedAt ?? null,
              serverRecord: st,
              detectedAt: new Date().toISOString(),
            });
            foundConflict = true;
            continue;
          }
          const localIsNewer = !!st &&
            new Date(lt.updatedAt ?? 0).getTime() > new Date(st.updatedAt ?? 0).getTime();
          if (!st || isPending || localIsNewer) {
            if (st) merged[merged.indexOf(st)] = lt; else merged.push(lt);
            writeOneTournament(lt)
              .then((ok) => {
                if (ok) clearPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, lt.id);
              })
              .catch((err) =>
                console.warn('[Storage] Re-sync of local tournament failed:', err)
              );
          } else if (st) {
            // Server version adopted — record it as the new baseline.
            setBaseline(STORAGE_KEYS.SYNCED_TOURNAMENTS, lt.id, st.updatedAt);
          }
        }

        // Propagate local deletions that happened while offline.
        for (const id of Object.keys(deleted)) {
          const idx = merged.findIndex((t) => t.id === id);
          if (idx >= 0) merged.splice(idx, 1);
          deleteOnServer(`/api/tournaments/${encodeURIComponent(id)}`).then((ok) => {
            if (ok) {
              clearPendingId(STORAGE_KEYS.DELETED_TOURNAMENTS, id);
              removeBaseline(STORAGE_KEYS.SYNCED_TOURNAMENTS, id);
              const c = lsReadConflicts();
              if (c[id]) { delete c[id]; lsWriteConflicts(c); }
            }
          });
        }

        lsWriteTournaments(merged);
        if (foundConflict) dispatchSyncConflicts();
        syncPendingMatchRecords().catch(() => {});
        return filterByCommunityId(merged, communityId);
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
// Returns true only when the server confirmed the write — used by the
// outbox to clear the pending flag.
async function writeOneTournament(tournament: Tournament): Promise<boolean> {
  let confirmed = false;
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
      return false;
    }
    if (res.status === 401) {
      console.warn('[Storage] Write rejected with 401 — session expired');
      dispatchAuthExpired();
      return false;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { error?: string }).error ?? `Server rejected tournament save (${res.status})`;
      console.warn('[Storage] Write failed:', res.status, msg);
      throw new Error(msg);
    }
    confirmed = true;
    setBaseline(STORAGE_KEYS.SYNCED_TOURNAMENTS, tournament.id, tournament.updatedAt);
  }
  if (hasSupabase()) {
    _supabaseSyncTournaments([tournament]).catch((err) =>
      console.warn('[Storage] Supabase tournament sync failed:', err)
    );
  }
  return confirmed;
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
  tournament.updatedAt = new Date().toISOString();
  const all = lsReadTournaments();
  const idx = all.findIndex((t) => t.id === tournament.id);
  if (idx >= 0) { all[idx] = tournament; } else { all.push(tournament); }
  lsWriteTournaments(all);
  markPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, tournament.id);
  writeOneTournament(tournament)
    .then((ok) => { if (ok) clearPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, tournament.id); })
    .catch((err) =>
      console.warn('[Storage] Background tournament write error:', err)
    );
}

export async function saveTournamentAsync(tournament: Tournament): Promise<void> {
  tournament.updatedAt = new Date().toISOString();
  const all = lsReadTournaments();
  const idx = all.findIndex((t) => t.id === tournament.id);
  // Keep the previous state so we can rollback on server rejection.
  const previous = idx >= 0 ? all[idx] : null;
  if (idx >= 0) { all[idx] = tournament; } else { all.push(tournament); }
  lsWriteTournaments(all);
  markPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, tournament.id);
  try {
    const ok = await writeOneTournament(tournament);
    if (ok) clearPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, tournament.id);
  } catch (serverErr) {
    // Server explicitly rejected the save (e.g., 403 inactive player).
    // Rollback localStorage so client state stays in sync with the server.
    const rollbackAll = lsReadTournaments();
    const rollbackIdx = rollbackAll.findIndex((t) => t.id === tournament.id);
    if (previous && rollbackIdx >= 0) {
      rollbackAll[rollbackIdx] = previous;
      // The restored version may itself be unsynced — keep it pending.
    } else if (!previous && rollbackIdx >= 0) {
      rollbackAll.splice(rollbackIdx, 1);
      clearPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, tournament.id);
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
  // This copy came from the server — it is by definition synced.
  clearPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, tournament.id);
  setBaseline(STORAGE_KEYS.SYNCED_TOURNAMENTS, tournament.id, tournament.updatedAt);
}

export function deleteTournament(id: string): void {
  const filtered = lsReadTournaments().filter((t) => t.id !== id);
  lsWriteTournaments(filtered);
  clearPendingId(STORAGE_KEYS.PENDING_TOURNAMENTS, id);
  markPendingId(STORAGE_KEYS.DELETED_TOURNAMENTS, id);
  isServerAvailable().then((available) => {
    if (available) {
      deleteOnServer(`/api/tournaments/${encodeURIComponent(id)}`).then((ok) => {
        if (ok) {
          clearPendingId(STORAGE_KEYS.DELETED_TOURNAMENTS, id);
          removeBaseline(STORAGE_KEYS.SYNCED_TOURNAMENTS, id);
          const c = lsReadConflicts();
          if (c[id]) { delete c[id]; lsWriteConflicts(c); }
        }
      });
    }
  });
  if (hasSupabase()) {
    _supabaseSyncTournaments(filtered).catch((err) =>
      console.warn('[Storage] Supabase tournament delete sync failed:', err)
    );
  }
}

export function clearAllTournaments(): void {
  const deleted = lsReadIdMap(STORAGE_KEYS.DELETED_TOURNAMENTS);
  const synced = lsReadIdMap(STORAGE_KEYS.SYNCED_TOURNAMENTS);
  const conflicts = lsReadConflicts();
  for (const t of lsReadTournaments()) {
    deleted[t.id] = new Date().toISOString();
    delete synced[t.id];
    delete conflicts[t.id];
  }
  lsWriteIdMap(STORAGE_KEYS.DELETED_TOURNAMENTS, deleted);
  lsWriteIdMap(STORAGE_KEYS.SYNCED_TOURNAMENTS, synced);
  lsWriteConflicts(conflicts);
  localStorage.removeItem(STORAGE_KEYS.PENDING_TOURNAMENTS);
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

// Write a single participant via PUT. Returns true only when the server
// confirmed the write — used by the outbox to clear the pending flag.
async function putParticipant(p: GlobalParticipant): Promise<boolean> {
  if (!(await isServerAvailable())) return false;
  try {
    const res = await fetch(`${SERVER_URL}/api/participants/${encodeURIComponent(p.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(p),
    });
    if (res.status === 401) {
      dispatchAuthExpired();
      return false;
    }
    if (res.ok) setBaseline(STORAGE_KEYS.SYNCED_PARTICIPANTS, p.id, p.updatedAt);
    return res.ok;
  } catch (err) {
    console.warn('[Storage] Participant write network error:', err);
    resetServerCache();
    return false;
  }
}

async function readAllParticipants(communityId?: string): Promise<GlobalParticipant[]> {
  const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${SERVER_URL}/api/participants${query}`);
      if (res.ok) {
        const data = (await res.json()) as GlobalParticipant[];
        const pending = lsReadIdMap(STORAGE_KEYS.PENDING_PARTICIPANTS);
        const deleted = lsReadIdMap(STORAGE_KEYS.DELETED_PARTICIPANTS);
        const baseline = lsReadIdMap(STORAGE_KEYS.SYNCED_PARTICIPANTS);
        const local = lsReadParticipants();
        const inScope = (p: GlobalParticipant) => !communityId || p.communityId === communityId;
        const merged = new Map(data.map((p) => [p.id, p]));
        let foundConflict = false;

        // Same merge as tournaments: pending/newer local records win and get
        // re-pushed; real conflicts (both sides changed) go to the user.
        for (const lp of local) {
          if (!inScope(lp) || deleted[lp.id]) continue;
          const sp = merged.get(lp.id);
          const isPending = !!pending[lp.id];
          const serverMoved = !!sp &&
            sp.updatedAt !== baseline[lp.id] && sp.updatedAt !== lp.updatedAt;
          if (isPending && serverMoved) {
            merged.set(lp.id, lp);
            addSyncConflict({
              id: lp.id,
              kind: 'participant',
              name: lp.alias?.trim() || lp.name,
              localUpdatedAt: lp.updatedAt ?? null,
              serverUpdatedAt: sp!.updatedAt ?? null,
              serverRecord: sp,
              detectedAt: new Date().toISOString(),
            });
            foundConflict = true;
            continue;
          }
          const localIsNewer = !!sp &&
            new Date(lp.updatedAt ?? 0).getTime() > new Date(sp.updatedAt ?? 0).getTime();
          if (!sp || isPending || localIsNewer) {
            merged.set(lp.id, lp);
            putParticipant(lp)
              .then((ok) => { if (ok) clearPendingId(STORAGE_KEYS.PENDING_PARTICIPANTS, lp.id); })
              .catch((err) => console.warn('[Storage] Re-sync of local participant failed:', err));
          } else if (sp) {
            setBaseline(STORAGE_KEYS.SYNCED_PARTICIPANTS, lp.id, sp.updatedAt);
          }
        }

        for (const id of Object.keys(deleted)) {
          merged.delete(id);
          deleteOnServer(`/api/participants/${encodeURIComponent(id)}`).then((ok) => {
            if (ok) {
              clearPendingId(STORAGE_KEYS.DELETED_PARTICIPANTS, id);
              removeBaseline(STORAGE_KEYS.SYNCED_PARTICIPANTS, id);
              const c = lsReadConflicts();
              if (c[id]) { delete c[id]; lsWriteConflicts(c); }
            }
          });
        }

        const communityMerged = [...merged.values()];
        const others = local.filter((p) => !inScope(p));
        lsWriteParticipants([...others, ...communityMerged]);
        if (foundConflict) dispatchSyncConflicts();
        return communityMerged;
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
  p.updatedAt = new Date().toISOString();
  const all = lsReadParticipants();
  const idx = all.findIndex((x) => x.id === p.id);
  if (idx >= 0) { all[idx] = p; } else { all.push(p); }
  lsWriteParticipants(all);
  markPendingId(STORAGE_KEYS.PENDING_PARTICIPANTS, p.id);

  const ok = await putParticipant(p);
  if (ok) clearPendingId(STORAGE_KEYS.PENDING_PARTICIPANTS, p.id);

  if (hasSupabase()) {
    _supabaseSyncParticipants([p]).catch((err) =>
      console.warn('[Storage] Supabase participant sync failed:', err)
    );
  }
}

export async function deleteGlobalParticipant(id: string): Promise<void> {
  const filtered = lsReadParticipants().filter((p) => p.id !== id);
  lsWriteParticipants(filtered);
  clearPendingId(STORAGE_KEYS.PENDING_PARTICIPANTS, id);
  markPendingId(STORAGE_KEYS.DELETED_PARTICIPANTS, id);
  if (await isServerAvailable()) {
    const ok = await deleteOnServer(`/api/participants/${encodeURIComponent(id)}`);
    // On failure the tombstone stays — the delete is retried on next sync.
    if (ok) clearPendingId(STORAGE_KEYS.DELETED_PARTICIPANTS, id);
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

// ══════════════════════════════════════════════════════════════════════════
//  TOURNAMENT MATCH RECORDS (history outbox)
// ══════════════════════════════════════════════════════════════════════════
// Match history records are append-only and upserted server-side by id, so
// re-pushing the same record is idempotent. `synced` marks whether the
// server confirmed the POST; unsynced records retry on every read/reconnect.

const MATCHES_KEY = 'bracket_tournament_matches';

interface StoredMatchRecord {
  id: string;
  tournamentId: string;
  synced?: boolean;
  [key: string]: unknown;
}

function lsReadMatchRecords(): StoredMatchRecord[] {
  try {
    const raw = localStorage.getItem(MATCHES_KEY);
    return raw ? (JSON.parse(raw) as StoredMatchRecord[]) : [];
  } catch {
    return [];
  }
}

function lsWriteMatchRecords(data: StoredMatchRecord[]): void {
  try {
    localStorage.setItem(MATCHES_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[Storage] localStorage match records write failed:', err);
  }
}

async function pushMatchRecord(record: StoredMatchRecord): Promise<boolean> {
  if (!(await isServerAvailable())) return false;
  try {
    const res = await fetch(`${SERVER_URL}/api/tournaments/${encodeURIComponent(record.tournamentId)}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(record),
    });
    if (res.status === 401) {
      dispatchAuthExpired();
      return false;
    }
    return res.ok;
  } catch (err) {
    console.warn('[Storage] Match record push failed:', err);
    resetServerCache();
    return false;
  }
}

/**
 * Append a match record to the local outbox and try to push it immediately.
 * Marks `synced` only when the server confirms — unsynced records are
 * retried by syncPendingMatchRecords on reconnect.
 */
export async function queueTournamentMatchRecord(record: StoredMatchRecord): Promise<void> {
  const all = lsReadMatchRecords();
  const entry: StoredMatchRecord = { ...record, synced: false };
  all.push(entry);
  lsWriteMatchRecords(all);
  if (await pushMatchRecord(entry)) {
    entry.synced = true;
    lsWriteMatchRecords(all);
  }
}

/** Re-push every match record the server never confirmed. */
export async function syncPendingMatchRecords(): Promise<number> {
  const all = lsReadMatchRecords();
  let synced = 0;
  for (const r of all) {
    if (r.synced) continue;
    if (await pushMatchRecord(r)) {
      r.synced = true;
      synced++;
    }
  }
  if (synced > 0) lsWriteMatchRecords(all);
  return synced;
}

// ── Reconnect hook ──────────────────────────────────────────────────────
// When the browser reports connectivity back, re-ping the server and push
// every pending local change without waiting for a page reload/navigation.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    resetServerCache();
    readAllTournaments().catch(() => {});
    readAllParticipants().catch(() => {});
    syncPendingMatchRecords().catch(() => {});
  });
}
