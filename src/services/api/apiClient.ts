/**
 * API Client — Fuente única de verdad para comunicación con el backend
 *
 * Centraliza:
 *   - URL del servidor (un solo lugar para cambiarla)
 *   - Health check compartido y cacheado (un solo request por sesión)
 *   - Detección de Supabase + stubs listos para implementar
 *   - Helpers genéricos fetch (GET / POST / PUT / DELETE)
 *
 * Ruta de migración:
 *   • Hoy       → Express local  (server/)
 *   • Supabase  → Llenar los stubs supabase*() y configurar VITE_SUPABASE_URL
 *   • React Native → Reemplazar fetch() con Supabase RPC / REST client;
 *                    también reemplazar localStorage con AsyncStorage
 */

/**
 * URL del backend Express.
 * - Local:       http://localhost:3001 (valor por defecto)
 * - Producción:  se lee de VITE_API_URL (configurado en Render o el host)
 *
 * Para cambiar en producción, define VITE_API_URL en el build.
 * En local puedes usar .env.local con VITE_API_URL=http://localhost:3001
 */
export const SERVER_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

const HEALTH_TIMEOUT_MS = 1500;

// ── Health check (compartido entre todos los servicios) ───────────────────
// Una sola Promise cacheada para que múltiples servicios no disparen
// health checks paralelos en la misma sesión.

let _healthPromise: Promise<boolean> | null = null;

export function isServerAvailable(): Promise<boolean> {
  if (_healthPromise) return _healthPromise;
  _healthPromise = fetch(`${SERVER_URL}/api/health`, {
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  })
    .then((res) => {
      const ok = res.ok;
      console.log(`[API] Servidor ${ok ? 'disponible' : 'no responde correctamente'}`);
      return ok;
    })
    .catch(() => {
      console.log('[API] Servidor no disponible — modo offline (localStorage)');
      return false;
    });
  return _healthPromise;
}

/** Resetear cache de health check (llamar cuando una petición falla inesperadamente). */
export function resetServerCache(): void {
  _healthPromise = null;
}

// ── Detección de Supabase ─────────────────────────────────────────────────

export function hasSupabase(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

// ── Stubs de Supabase ─────────────────────────────────────────────────────
// TODO: implementar con @supabase/supabase-js cuando se configuren las env vars.
// Al llenar estos stubs, todos los servicios obtendrán soporte de Supabase
// automáticamente sin cambiar su lógica interna.

export async function supabaseGet<T>(
  _table: string,
  _filter?: Record<string, unknown>
): Promise<T | null> {
  // TODO: const { data } = await supabase.from(_table).select('*').match(_filter ?? {})
  // return data as T | null
  return null;
}

export async function supabaseUpsert<T>(
  _table: string,
  _data: unknown
): Promise<T | null> {
  // TODO: const { data } = await supabase.from(_table).upsert(_data)
  // return data as T | null
  return null;
}

export async function supabaseDeleteRow(
  _table: string,
  _id: string
): Promise<boolean> {
  // TODO: await supabase.from(_table).delete().eq('id', _id)
  // return true
  return false;
}

// ── Auth header ───────────────────────────────────────────────────────────
// Lee el token de localStorage para adjuntarlo a todas las peticiones.
// authService.ts lo escribe/limpia; aquí solo lo leemos.

function getAuthHeader(): Record<string, string> {
  try {
    const token = localStorage.getItem('bracket_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// ── Helpers fetch genéricos ───────────────────────────────────────────────
// Verifican disponibilidad del servidor y manejan errores de forma uniforme.
// Los servicios los usan en lugar de llamar fetch() directamente.

async function safeFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    if (!(await isServerAvailable())) return null;
    const authHeader = getAuthHeader();
    const merged: RequestInit = {
      ...options,
      headers: { ...authHeader, ...(options?.headers as Record<string, string> ?? {}) },
    };
    const res = await fetch(`${SERVER_URL}${path}`, merged);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) return null;
    return res.json() as Promise<T>;
  } catch {
    resetServerCache();
    return null;
  }
}

export async function apiGet<T>(path: string): Promise<T | null> {
  return safeFetch<T>(path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T | null> {
  return safeFetch<T>(path, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T | null> {
  return safeFetch<T>(path, {
    method: 'PUT',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete(path: string): Promise<boolean> {
  try {
    if (!(await isServerAvailable())) return false;
    const res = await fetch(`${SERVER_URL}${path}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    return res.ok;
  } catch {
    resetServerCache();
    return false;
  }
}
