/**
 * Auth Service
 *
 * Centraliza todo lo relacionado a sesión de usuario.
 * Hoy apunta al servidor Express local.
 *
 * Migración → Supabase:
 *   login()       → supabase.auth.signInWithPassword()
 *   logout()      → supabase.auth.signOut()
 *   getMe()       → supabase.auth.getUser()
 *   createUser()  → supabase.auth.admin.createUser()
 *   updateUser()  → supabase.auth.admin.updateUserById()
 */

import { SERVER_URL } from '@/services/api/apiClient';
import type { AuthSession, AuthUser, SessionUser } from '@/models/auth';

const TOKEN_KEY = 'bracket_auth_token';

// ── Token helpers ────────────────────────────────────────────────────────

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function storeToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

/** Header Authorization para adjuntar en fetch. */
export function getAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Parsea el campo `exp` del JWT sin verificar firma (solo para UX client-side).
 * Retorna el timestamp Unix de expiración, o null si no se puede parsear.
 */
export function getTokenExpiryTs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Retorna true si el token almacenado expira en menos de `thresholdSeconds` segundos.
 * Si no hay token o no se puede parsear, retorna false.
 */
export function isTokenExpiringSoon(thresholdSeconds = 86400 /* 1 día */): boolean {
  const token = getStoredToken();
  if (!token) return false;
  const exp = getTokenExpiryTs(token);
  if (!exp) return false;
  return exp - Date.now() / 1000 < thresholdSeconds;
}

// ── Auth calls ───────────────────────────────────────────────────────────

/** Inicia sesión. Lanza error con mensaje del servidor si falla. */
export async function login(username: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  storeToken(data.token);
  return { ...data, notifications: data.notifications || [] } as AuthSession;
}

/** Cierra sesión localmente (el token vive en localStorage). */
export function logout(): void {
  clearToken();
  // Notificar al servidor (no bloqueante, solo para registrar lastLoginAt si se desea)
  fetch(`${SERVER_URL}/api/auth/logout`, {
    method: 'POST',
    headers: getAuthHeader(),
  }).catch(() => {});
}

/** Restaura sesión desde el token almacenado. Retorna null si expiró. */
export async function getMe(): Promise<SessionUser | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { clearToken(); return null; }
    return await res.json() as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Pide un token fresco al servidor sin re-login.
 * Llama a POST /api/auth/refresh con el token actual.
 * Guarda el nuevo token si tiene éxito.
 * Retorna el usuario actualizado, o null si falla.
 */
export async function refreshToken(): Promise<SessionUser | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { clearToken(); return null; }
    const data = await res.json() as { token: string; user: SessionUser };
    storeToken(data.token);
    return data.user;
  } catch {
    return null;
  }
}

/** Verifica si el sistema necesita setup inicial (sin usuarios). */
export async function getAuthStatus(): Promise<{ needsSetup: boolean }> {
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/status`);
    if (!res.ok) return { needsSetup: false };
    return await res.json();
  } catch {
    return { needsSetup: false };
  }
}

/** Crea el primer admin (solo funciona si users.json está vacío). */
export async function setupAdmin(username: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${SERVER_URL}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Setup failed');
  storeToken(data.token);
  return data as AuthSession;
}

// ── Self-service ─────────────────────────────────────────────────────────

/** Cambia la contraseña del usuario actualmente autenticado. */
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/auth/me/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to change password');
}

// ── User management (admin) ──────────────────────────────────────────────

/** Lista todos los usuarios. Requiere rol admin. */
export async function listUsers(): Promise<AuthUser[]> {
  const res = await fetch(`${SERVER_URL}/api/auth/users`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

/** Crea cuenta para un participant existente. */
export async function createUserAccount(
  participantId: string,
  username: string,
  password: string,
  role: AuthUser['role'] = 'user',
  communityId?: string,
  gameAdminFor?: string[]
): Promise<AuthUser> {
  const res = await fetch(`${SERVER_URL}/api/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ participantId, username, password, role, communityId, gameAdminFor }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create user');
  return data as AuthUser;
}

/** Actualiza username / password / isActive / role de un usuario. */
export async function updateUserAccount(
  userId: string,
  updates: Partial<{ username: string; password: string; isActive: boolean; role: AuthUser['role']; communityId: string | null; gameAdminFor: string[] }>
): Promise<AuthUser> {
  const res = await fetch(`${SERVER_URL}/api/auth/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update user');
  return data as AuthUser;
}

/** Borra una cuenta permanentemente (requiere admin). */
export async function deleteUserAccount(userId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/auth/users/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete user');
  }
}
