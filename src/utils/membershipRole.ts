/**
 * Membership role helpers (frontend)
 *
 * Espejo de server/utils/communityScope.js: el rol real de un usuario vive en
 * `user.memberships[].role`, uno por comunidad (incluida la comunidad home).
 * `user.role` solo puede ser 'superadmin' (rol global) o null/undefined.
 *
 * Centraliza aquí toda la lógica de "¿qué puede hacer este usuario en esta
 * comunidad?" para que ningún componente reimplemente su propia jerarquía
 * local (eso fue justo lo que causó bugs de sincronización antes).
 */

export type CommunityRoleValue = 'superadmin' | 'community_admin' | 'admin' | 'user' | null;

export interface MembershipLike {
  communityId: string;
  role?: string | null;
  gameAdminFor?: string[];
  isActive?: boolean;
}

export interface UserLike {
  id?: string;
  role?: string | null;
  memberships?: MembershipLike[];
}

/** Devuelve la membership activa del usuario en una comunidad, o null. */
export function getMembership(user: UserLike | null | undefined, communityId: string | null | undefined): MembershipLike | null {
  if (!user || !communityId) return null;
  const m = (user.memberships ?? []).find((x) => x.communityId === communityId);
  if (!m || m.isActive === false) return null;
  return m;
}

/** Rol efectivo del usuario EN una comunidad concreta. superadmin es global. */
export function communityRoleOf(user: UserLike | null | undefined, communityId: string | null | undefined): CommunityRoleValue {
  if (!user) return null;
  if (user.role === 'superadmin') return 'superadmin';
  const m = getMembership(user, communityId);
  if (!m) return null;
  const role = m.role ?? 'user';
  return (['user', 'admin', 'community_admin'].includes(role) ? role : 'user') as CommunityRoleValue;
}

/** Juegos que administra dentro de una comunidad (solo aplica a role 'admin'; [] = todos). */
export function gameAdminForOf(user: UserLike | null | undefined, communityId: string | null | undefined): string[] {
  if (!user || user.role === 'superadmin') return [];
  const m = getMembership(user, communityId);
  if (!m || m.role !== 'admin') return [];
  return m.gameAdminFor ?? [];
}

/** true si es superadmin o community_admin DE esa comunidad. */
export function isCommunityAdminOf(user: UserLike | null | undefined, communityId: string | null | undefined): boolean {
  const role = communityRoleOf(user, communityId);
  return role === 'superadmin' || role === 'community_admin';
}

/** true si tiene cualquier nivel de admin (con o sin scope de juego) en esa comunidad. */
export function isAdminInCommunity(user: UserLike | null | undefined, communityId: string | null | undefined): boolean {
  const role = communityRoleOf(user, communityId);
  return role === 'superadmin' || role === 'community_admin' || role === 'admin';
}

/** true si es 'admin' CON gameAdminFor no vacío EN esa comunidad (admin scopenado). */
export function isScopedAdminOf(user: UserLike | null | undefined, communityId: string | null | undefined): boolean {
  return communityRoleOf(user, communityId) === 'admin' && gameAdminForOf(user, communityId).length > 0;
}

/** Permisos de administración por juego DENTRO de una comunidad. */
export function canAdminGameOf(
  user: UserLike | null | undefined,
  communityId: string | null | undefined,
  gameId: string | null | undefined
): boolean {
  const role = communityRoleOf(user, communityId);
  if (role === 'superadmin' || role === 'community_admin') return true;
  if (role === 'admin') {
    const scope = gameAdminForOf(user, communityId);
    if (scope.length === 0) return true;
    return gameId != null && scope.includes(gameId);
  }
  return false;
}

/**
 * Jerarquía administrativa DENTRO de una comunidad:
 *   superadmin (4) > community_admin (3) > admin sin scope (2)
 *   > admin con gameAdminFor (1) > user (0) / no-miembro (-1)
 */
export function adminLevelOf(user: UserLike | null | undefined, communityId: string | null | undefined): number {
  const role = communityRoleOf(user, communityId);
  if (role === 'superadmin') return 4;
  if (role === 'community_admin') return 3;
  if (role === 'admin') return gameAdminForOf(user, communityId).length > 0 ? 1 : 2;
  if (role === 'user') return 0;
  return -1;
}

/** true si `caller` supera o es igual (mismo id) a `target` EN esa comunidad. */
export function outranksOf(
  caller: UserLike | null | undefined,
  target: UserLike | null | undefined,
  communityId: string | null | undefined
): boolean {
  if (!target) return true; // sin cuenta vinculada: cualquier admin gestiona
  if (caller?.id && target.id && caller.id === target.id) return true; // uno mismo
  return adminLevelOf(caller, communityId) > adminLevelOf(target, communityId);
}
