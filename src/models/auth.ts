import type { AppNotification } from './notification';

/**
 * Auth model types
 *
 * Migración → Supabase:
 *   AuthUser.id       → supabase.auth.User.id
 *   AuthUser.role     → user_metadata.role o tabla profiles
 *   AuthSession.token → supabase session.access_token
 */

/** Identidad del user en una comunidad extra: participant separado con sus propios datos. */
export interface CommunityMembership {
  participantId: string;
  communityId: string;
  isActive: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  role: 'superadmin' | 'community_admin' | 'admin' | 'user';
  participantId: string | null;
  communityId: string | null;
  /** Membresías en comunidades extra: cada una apunta a un participant distinto. */
  memberships?: CommunityMembership[];
  /** Comunidades activas (hogar + membresías). Devuelto por /me y en el JWT. */
  communityIds?: string[];
  /** communityId → participantId del user en esa comunidad. */
  participantByCommunity?: Record<string, string>;
  gameAdminFor?: string[]; // Array de gameIds para los que este admin tiene permisos (solo para role='admin')
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Lo que devuelve POST /api/auth/login y POST /api/auth/setup */
export interface AuthSession {
  token: string;
  user: AuthUser;
  notifications: AppNotification[];
}

/** Usuario almacenado en contexto — sin campos sensibles de BD */
export interface SessionUser {
  id: string;
  username: string;
  role: 'superadmin' | 'community_admin' | 'admin' | 'user';
  participantId: string | null;
  communityId: string | null;
  /** Membresías en comunidades extra (participant distinto por comunidad). */
  memberships?: CommunityMembership[];
  /** Comunidades activas (hogar + membresías). */
  communityIds?: string[];
  /** communityId → participantId del user en esa comunidad. */
  participantByCommunity?: Record<string, string>;
  gameAdminFor?: string[]; // Array de gameIds para los que este admin tiene permisos
}
