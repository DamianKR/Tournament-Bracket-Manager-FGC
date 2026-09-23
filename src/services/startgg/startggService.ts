/**
 * start.gg integration service
 *
 * Cubre la Fase 1 (account linking) del flujo OAuth.
 * Las fases posteriores (importación de torneos, etc.) se añadirán aquí.
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
