import type { AppNotification } from './notification';

/**
 * Auth model types
 *
 * Migración → Supabase:
 *   AuthUser.id       → supabase.auth.User.id
 *   AuthUser.role     → user_metadata.role o tabla profiles
 *   AuthSession.token → supabase session.access_token
 */

/** Identidad del user en una comunidad: participant separado con sus propios datos. */
export interface CommunityMembership {
  participantId: string;
  communityId: string;
  isActive: boolean;
  /** Rol del usuario dentro de esta comunidad. */
  role?: 'user' | 'admin' | 'community_admin';
  /** Juegos que administra dentro de esta comunidad (solo cuando role === 'admin'). */
  gameAdminFor?: string[];
}

export interface AuthUser {
  id: string;
  username: string;
  /** Único rol global: superadmin. null/undefined = usuario normal; su poder vive en memberships. */
  role?: 'superadmin' | 'community_admin' | 'admin' | 'user' | null;
  participantId: string | null;
  communityId: string | null;
  /** Membresías en comunidades: cada una apunta a un participant distinto y a un rol. */
  memberships?: CommunityMembership[];
  /** Comunidades activas (hogar + membresías). Devuelto por /me y en el JWT. */
  communityIds?: string[];
  /** communityId → participantId del user en esa comunidad. */
  participantByCommunity?: Record<string, string>;
  /** @deprecated Usar membership.gameAdminFor. Conservado para fallback. */
  gameAdminFor?: string[];
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
  /** @deprecated Usar memberships; solo superadmin es global. */
  role?: 'superadmin' | 'community_admin' | 'admin' | 'user' | null;
  participantId: string | null;
  communityId: string | null;
  /** Membresías en comunidades (participant distinto por comunidad). */
  memberships?: CommunityMembership[];
  /** Comunidades activas (hogar + membresías). */
  communityIds?: string[];
  /** communityId → participantId del user en esa comunidad. */
  participantByCommunity?: Record<string, string>;
  /** @deprecated Usar memberships. */
  gameAdminFor?: string[];
}
