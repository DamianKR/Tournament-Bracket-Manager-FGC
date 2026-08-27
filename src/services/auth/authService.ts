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

function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

/** Header Authorization para adjuntar en fetch. */
export function getAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  return data as AuthSession;
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
  role: 'admin' | 'user' = 'user'
): Promise<AuthUser> {
  const res = await fetch(`${SERVER_URL}/api/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ participantId, username, password, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create user');
  return data as AuthUser;
}

/** Actualiza username / password / isActive / role de un usuario. */
export async function updateUserAccount(
  userId: string,
  updates: Partial<{ username: string; password: string; isActive: boolean; role: 'admin' | 'user' }>
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

/** Desactiva una cuenta (no la borra). */
export async function deactivateUser(userId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/auth/users/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to deactivate user');
  }
}
