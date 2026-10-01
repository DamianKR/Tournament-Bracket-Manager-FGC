/**
 * start.gg integration service
 *
 * Fase 1: Account linking (OAuth).
 * Fase 2: Tournament preview e import.
 */

import { SERVER_URL } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';

// ── Tipos ────────────────────────────────────────────────────────────────

export interface StartggLinkStatus {
  linked: boolean;
  startggUserId:   number | null;
  startggPlayerId: number | null;
  startggSlug:     string | null;
  startggGamerTag: string | null;
}

// ── Account linking ──────────────────────────────────────────────────────

/**
 * Solicita al backend la URL de autorización OAuth de start.gg y
 * redirige al usuario allí.
 * Antes de redirigir, guarda un `state` aleatorio en sessionStorage
 * para verificar en el callback y evitar CSRF.
 */
export async function redirectToStartggOAuth(): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/startgg/auth/url`, {
    headers: getAuthHeader(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'No se pudo obtener la URL de autorización');
  }

  const { url } = await res.json();

  // Guardar state aleatoria para validar el callback
  const state = Math.random().toString(36).slice(2);
  sessionStorage.setItem('startgg_oauth_state', state);

  // Añadir state a la URL
  window.location.href = `${url}&state=${encodeURIComponent(state)}`;
}

/**
 * Llamado desde la página callback: envía el code al backend,
 * que lo canjea por un token y guarda los IDs del usuario start.gg.
 */
export async function completeStartggOAuth(code: string): Promise<StartggLinkStatus> {
  const res = await fetch(`${SERVER_URL}/api/startgg/auth/callback`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Error al conectar con start.gg');
  }

  return res.json();
}

/**
 * Desvincula la cuenta start.gg del usuario actual.
 */
export async function disconnectStartgg(): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/startgg/auth/disconnect`, {
    method:  'DELETE',
    headers: getAuthHeader(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Error al desconectar start.gg');
  }
}

/**
 * Obtiene el estado de vinculación start.gg del usuario autenticado.
 */
export async function getStartggLinkStatus(): Promise<StartggLinkStatus> {
  const res = await fetch(`${SERVER_URL}/api/startgg/me`, {
    headers: getAuthHeader(),
  });

  if (!res.ok) {
    throw new Error('Error al obtener estado de start.gg');
  }

  return res.json();
}

// ── Fase 2: Tournament import ────────────────────────────────────────────

export interface StartggVideogame {
  id: number;
  name: string;
}

export interface StartggEventPreview {
  id: number;
  name: string;
  type: string;
  numEntrants: number;
  videogame: StartggVideogame | null;
}

export interface StartggTournamentPreview {
  id: number;
  name: string;
  slug: string;
  startAt: number | null;
  endAt: number | null;
  numAttendees: number | null;
  normalizedSlug: string;
  events: StartggEventPreview[];
}

export interface ImportSummary {
  tournamentId: string;
  tournamentName: string;
  entrants: number;
  sets: number;
  standings: number;
  linked: number;
  stubs: number;
  localGameId: string | null;
  mode: string;
}

export interface ImportedTournament {
  id: string;
  name: string;
  startggSlug: string | null;
  startggEventId: number | null;
  importedAt: string | null;
  entrants: number;
  gameId: string | null;
  status: string;
  completedAt: string | null;
  givesPoints: boolean;
  eloApplied: boolean;
}

/**
 * Preview de un torneo de start.gg (slug o URL completo).
 * Devuelve metadata del torneo y la lista de eventos disponibles.
 */
export async function previewStartggTournament(slug: string): Promise<StartggTournamentPreview> {
  const res = await fetch(`${SERVER_URL}/api/startgg/import/preview`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ slug }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Error al previsualizar el torneo');
  }

  return res.json();
}

/**
 * Importa un evento específico de start.gg a la comunidad local.
 */
export async function importStartggEvent(
  slug: string,
  eventId: number,
  communityId: string,
  givesPoints: boolean = false,
  pointsDepth: number = 8
): Promise<ImportSummary> {
  const res = await fetch(`${SERVER_URL}/api/startgg/import/event`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ slug, eventId, communityId, givesPoints, pointsDepth }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Error al importar el torneo');
  }

  return res.json();
}

/**
 * Lista los torneos ya importados desde start.gg en una comunidad.
 */
export async function getImportedTournaments(communityId: string): Promise<ImportedTournament[]> {
  const res = await fetch(
    `${SERVER_URL}/api/startgg/imported?communityId=${encodeURIComponent(communityId)}`,
    { headers: getAuthHeader() }
  );

  if (!res.ok) return [];
  return res.json();
}

// ── Fase 3: Character map ────────────────────────────────────────────────

/** Mapeo por juego: gameId → { sggCharId(string) → localCharId(string) } */
export type CharMap = Record<string, Record<string, string>>;

export interface EnrichSummary {
  localTournamentId: string;
  setsUpdated: number;
  localGameId: string | null;
}

/**
 * Obtiene el mapeo completo start.gg charId → local charId.
 */
export async function getCharMap(): Promise<CharMap> {
  const res = await fetch(`${SERVER_URL}/api/startgg/char-map`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) return {};
  return res.json();
}

/**
 * Guarda cambios en el char map (merge, no reemplaza).
 */
export async function saveCharMap(map: CharMap): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/startgg/char-map`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(map),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Error al guardar char map');
  }
}

/**
 * Enriquece un torneo ya importado con datos de personajes.
 */
export async function enrichTournamentCharacters(
  tournamentId: string,
  eventId: number,
  gameId: string,
  communityId: string
): Promise<EnrichSummary> {
  const res = await fetch(`${SERVER_URL}/api/startgg/import/characters`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ tournamentId, eventId, gameId, communityId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Error al importar personajes');
  }
  return res.json();
}

/**
 * Habilita givesPoints en un torneo ya importado y dispara el cálculo de ELO
 * en el servidor (que detecta status=completed + eloApplied=false y lo aplica).
 * Devuelve el número de participantes que recibieron puntos.
 */
export async function enableTournamentPoints(
  tournamentId: string,
  pointsDepth: number = 8
): Promise<number> {
  // Fetch the current tournament record so the PUT body is complete
  const getRes = await fetch(`${SERVER_URL}/api/tournaments/${encodeURIComponent(tournamentId)}`, {
    headers: getAuthHeader(),
  });
  if (!getRes.ok) throw new Error('No se pudo cargar el torneo');
  const tournament = await getRes.json();

  const putRes = await fetch(`${SERVER_URL}/api/tournaments/${encodeURIComponent(tournamentId)}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ ...tournament, givesPoints: true, pointsDepth }),
  });
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err.error ?? 'Error al aplicar puntos');
  }
  const saved = await putRes.json();
  return Array.isArray(saved.eloUpdates) ? saved.eloUpdates.length : 0;
}
