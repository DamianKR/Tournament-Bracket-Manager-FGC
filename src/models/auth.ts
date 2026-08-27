/**
 * Auth model types
 *
 * Migración → Supabase:
 *   AuthUser.id       → supabase.auth.User.id
 *   AuthUser.role     → user_metadata.role o tabla profiles
 *   AuthSession.token → supabase session.access_token
 */

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  participantId: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Lo que devuelve POST /api/auth/login y POST /api/auth/setup */
export interface AuthSession {
  token: string;
  user: AuthUser;
}

/** Usuario almacenado en contexto — sin campos sensibles de BD */
export interface SessionUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  participantId: string | null;
}
