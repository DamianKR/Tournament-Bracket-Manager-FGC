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
 */

import { Tournament } from '@/models/types';
import { STORAGE_KEYS } from '@/constants/tournament';

const LOCAL_SERVER = 'http://localhost:3001';
const HEALTH_TIMEOUT_MS = 800;

// ── Local server detection ──────────────────────────────────────────────

let _serverAvailable: boolean | null = null; // cached per session

async function isLocalServerAvailable(): Promise<boolean> {
  if (_serverAvailable !== null) return _serverAvailable;

  try {
    const res = await fetch(`${LOCAL_SERVER}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    _serverAvailable = res.ok;
  } catch {
    _serverAvailable = false;
  }

  return _serverAvailable;
}

// Reset cache so next call re-checks (called on save failures)
function resetServerCache() {
  _serverAvailable = null;
}

// ── Supabase slot ───────────────────────────────────────────────────────
// Not implemented yet. Add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
// to a .env file and implement these two functions when ready.

async function _supabaseLoad(): Promise<Tournament[] | null> {
  // TODO: implement with @supabase/supabase-js
  return null;
}

async function _supabaseSync(_tournaments: Tournament[]): Promise<void> {
  // TODO: implement with @supabase/supabase-js
}

const hasSupabase = () =>
  !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// ── localStorage helpers ────────────────────────────────────────────────

function lsRead(): Tournament[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TOURNAMENTS);
    return raw ? (JSON.parse(raw) as Tournament[]) : [];
  } catch {
    return [];
  }
}

function lsWrite(tournaments: Tournament[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TOURNAMENTS, JSON.stringify(tournaments));
  } catch (err) {
    console.error('[Storage] localStorage write failed:', err);
  }
}

// ── Core read/write ─────────────────────────────────────────────────────

async function readAll(): Promise<Tournament[]> {
  // 1. Try local JSON server
  if (await isLocalServerAvailable()) {
    try {
      const res = await fetch(`${LOCAL_SERVER}/api/tournaments`);
      if (res.ok) {
        const data = (await res.json()) as Tournament[];
        // Keep localStorage in sync so offline fallback is fresh
        lsWrite(data);
        return data;
      }
    } catch (err) {
      console.warn('[Storage] Local server read failed, falling back:', err);
      resetServerCache();
    }
  }

  // 2. Try Supabase (future)
  if (hasSupabase()) {
    const data = await _supabaseLoad();
    if (data) {
      lsWrite(data);
      return data;
    }
  }

  // 3. Fallback: localStorage
  return lsRead();
}

async function writeAll(tournaments: Tournament[]): Promise<void> {
  // 1. localStorage — always first, synchronous, never fails
  lsWrite(tournaments);

  // 2. Local JSON server — fire and forget
  if (await isLocalServerAvailable()) {
    fetch(`${LOCAL_SERVER}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tournaments),
    }).catch((err) => {
      console.warn('[Storage] Local server write failed:', err);
      resetServerCache();
    });
  }

  // 3. Supabase sync — fire and forget (future)
  if (hasSupabase()) {
    _supabaseSync(tournaments).catch((err) =>
      console.warn('[Storage] Supabase sync failed:', err)
    );
  }
}

// ── Public API (same interface as before — no changes needed upstream) ──

export function loadTournaments(): Tournament[] {
  // Sync façade: returns localStorage immediately.
  // Components that need fresh data should call loadTournamentsAsync.
  return lsRead();
}

export async function loadTournamentsAsync(): Promise<Tournament[]> {
  return readAll();
}

export function saveTournaments(tournaments: Tournament[]): void {
  // Sync façade: writes localStorage immediately, async layers in background.
  lsWrite(tournaments);
  writeAll(tournaments).catch((err) =>
    console.warn('[Storage] Background write error:', err)
  );
}

export function saveTournament(tournament: Tournament): void {
  const all = lsRead();
  const idx = all.findIndex((t) => t.id === tournament.id);
  if (idx >= 0) {
    all[idx] = tournament;
  } else {
    all.push(tournament);
  }
  saveTournaments(all);
}

export function loadTournament(id: string): Tournament | null {
  return lsRead().find((t) => t.id === id) ?? null;
}

export function deleteTournament(id: string): void {
  const filtered = lsRead().filter((t) => t.id !== id);
  saveTournaments(filtered);
}

export function clearAllTournaments(): void {
  localStorage.removeItem(STORAGE_KEYS.TOURNAMENTS);
  writeAll([]).catch(() => {});
}

export function getTournamentCount(): number {
  return lsRead().length;
}

export function tournamentExists(id: string): boolean {
  return lsRead().some((t) => t.id === id);
}
