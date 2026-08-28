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
import {
  SERVER_URL,
  isServerAvailable,
  resetServerCache,
  hasSupabase,
  supabaseGet,
  supabaseUpsert,
} from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';

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
    return raw ? (JSON.parse(raw) as Tournament[]) : [];
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

async function readAllTournaments(): Promise<Tournament[]> {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${SERVER_URL}/api/tournaments`);
      if (res.ok) {
        const data = (await res.json()) as Tournament[];
        // Only overwrite localStorage if server has data OR localStorage is also empty.
        // This prevents wiping localStorage on a fresh server with no data yet.
        if (data.length > 0 || lsReadTournaments().length === 0) {
          lsWriteTournaments(data);
        }
        return data.length > 0 ? data : lsReadTournaments();
      }
    } catch (err) {
      console.warn('[Storage] Local server tournaments read failed:', err);
      resetServerCache();
    }
  }
  if (hasSupabase()) {
    const data = await _supabaseLoadTournaments();
    if (data) { lsWriteTournaments(data); return data; }
  }
  return lsReadTournaments();
}

async function writeAllTournaments(data: Tournament[]): Promise<void> {
  lsWriteTournaments(data);
  if (await isServerAvailable()) {
    fetch(`${SERVER_URL}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    }).catch((err) => { console.warn('[Storage] Local server tournaments write failed:', err); resetServerCache(); });
  }
  if (hasSupabase()) {
    _supabaseSyncTournaments(data).catch((err) =>
      console.warn('[Storage] Supabase tournaments sync failed:', err)
    );
  }
}

// Write a single tournament via PUT (more efficient than bulk POST).
async function writeOneTournament(tournament: Tournament): Promise<void> {
  if (await isServerAvailable()) {
    fetch(`${SERVER_URL}/api/tournaments/${encodeURIComponent(tournament.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(tournament),
    }).catch((err) => { console.warn('[Storage] Local server tournament write failed:', err); resetServerCache(); });
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

export async function loadTournamentsAsync(): Promise<Tournament[]> {
  return readAllTournaments();
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
  if (idx >= 0) { all[idx] = tournament; } else { all.push(tournament); }
  lsWriteTournaments(all);
  await writeOneTournament(tournament);
}

export function loadTournament(id: string): Tournament | null {
  return lsReadTournaments().find((t) => t.id === id) ?? null;
}

export function deleteTournament(id: string): void {
  const filtered = lsReadTournaments().filter((t) => t.id !== id);
  saveTournaments(filtered);
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
    // Migrate old records missing new fields
    return data.map((p) => ({
      ...p,
      gameId: p.gameId ?? null,
      mainCharacterId: p.mainCharacterId ?? null,
      tournamentIds: p.tournamentIds ?? [],
    }));
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

async function readAllParticipants(): Promise<GlobalParticipant[]> {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${SERVER_URL}/api/participants`);
      if (res.ok) {
        const data = (await res.json()) as GlobalParticipant[];
        // Only overwrite localStorage if server has data OR localStorage is also empty.
        if (data.length > 0 || lsReadParticipants().length === 0) {
          lsWriteParticipants(data);
        }
        return data.length > 0 ? data : lsReadParticipants();
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
  return lsReadParticipants();
}

// Exactamente igual que writeAllTournaments pero para participants
async function writeAllParticipants(data: GlobalParticipant[]): Promise<void> {
  lsWriteParticipants(data);
  if (await isServerAvailable()) {
    fetch(`${SERVER_URL}/api/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    }).catch((err) => { console.warn('[Storage] Local server participants write failed:', err); resetServerCache(); });
  }
  if (hasSupabase()) {
    _supabaseSyncParticipants(data).catch((err) =>
      console.warn('[Storage] Supabase participants sync failed:', err)
    );
  }
}

// ── GlobalParticipants public API ───────────────────────────────────────

export function loadGlobalParticipants(): GlobalParticipant[] {
  return lsReadParticipants();
}

export async function loadGlobalParticipantsAsync(): Promise<GlobalParticipant[]> {
  return readAllParticipants();
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
  await saveGlobalParticipants(all);
}

export async function deleteGlobalParticipant(id: string): Promise<void> {
  const filtered = lsReadParticipants().filter((p) => p.id !== id);
  await saveGlobalParticipants(filtered);
}

// Adds a tournamentId to the participant's FK list (bidirectional link)
export async function linkParticipantToTournament(participantId: string, tournamentId: string): Promise<void> {
  const all = lsReadParticipants();
  const p = all.find((x) => x.id === participantId);
  if (p && !p.tournamentIds.includes(tournamentId)) {
    p.tournamentIds.push(tournamentId);
    p.updatedAt = new Date().toISOString();
    await saveGlobalParticipants(all);
  }
}

export function findGlobalParticipantByName(name: string): GlobalParticipant | null {
  return lsReadParticipants().find(
    (p) => p.name.toLowerCase() === name.trim().toLowerCase()
  ) ?? null;
}

export function searchGlobalParticipants(query: string): GlobalParticipant[] {
  const q = query.trim().toLowerCase();
  const all = lsReadParticipants().filter((p) =>
    p.name.toLowerCase().includes(q) || p.alias?.toLowerCase().includes(q)
  );
  return all.sort((a, b) => a.name.localeCompare(b.name));
}
