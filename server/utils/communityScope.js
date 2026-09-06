/**
 * Community scope helpers
 *
 * All list routes should filter by an explicit `communityId` query param when
 * the request comes from a community-scoped page. Superadmins can view every
 * community, but they still receive the same filtered dataset as regular users
 * when a community is requested, so the UI never mixes data from two
 * communities.
 */

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';

export function getTargetCommunityId(user, requestedCommunityId) {
  if (user?.role === 'superadmin') {
    return requestedCommunityId || DEFAULT_COMMUNITY_ID;
  }
  return requestedCommunityId || user?.communityId || DEFAULT_COMMUNITY_ID;
}

export function isInUserScope(user, communityId) {
  if (!user) return true; // Public read access
  if (user.role === 'superadmin') return true;
  const home = user.communityId || DEFAULT_COMMUNITY_ID;
  if (communityId === home) return true;
  // Multi-comunidad: el usuario puede actuar en comunidades donde es miembro
  if (Array.isArray(user.communityIds) && user.communityIds.includes(communityId)) return true;
  for (const m of user.memberships ?? []) {
    if (m.isActive !== false && m.communityId === communityId) return true;
  }
  return false;
}

export function filterByCommunity(user, items, requestedCommunityId) {
  // Explicit community filter wins for everyone (superadmin included).
  const target = requestedCommunityId || (user?.role === 'superadmin' ? null : user?.communityId) || null;
  if (target) {
    return items.filter(item =>
      !item.communityId ||
      item.communityId === target
    );
  }

  // No explicit target and no user: keep legacy/default records only.
  if (!user) {
    return items.filter(item => !item.communityId || item.communityId === DEFAULT_COMMUNITY_ID);
  }

  // Superadmin with no target sees all communities (admin panels).
  return items;
}

/**
 * Permisos de administración por juego.
 * - superadmin / community_admin → todos los juegos de su comunidad.
 * - admin sin `gameAdminFor` → todos los juegos (comportamiento heredado).
 * - admin con `gameAdminFor` → solo los juegos listados ("game admin").
 * - user → nunca.
 */
export function canAdminGame(user, gameId) {
  if (!user) return false;
  if (user.role === 'superadmin' || user.role === 'community_admin') return true;
  if (user.role === 'admin') {
    if (!Array.isArray(user.gameAdminFor) || user.gameAdminFor.length === 0) return true;
    return gameId != null && user.gameAdminFor.includes(gameId);
  }
  return false;
}

/**
 * Jerarquía administrativa:
 *   superadmin (4) > community_admin (3) > admin sin scope (2)
 *   > admin con gameAdminFor (1) > user (0) / nadie (-1)
 * Un usuario NO puede modificar/borrar a otro de nivel igual o superior.
 */
export function adminLevel(user) {
  if (!user) return -1;
  if (user.role === 'superadmin') return 4;
  if (user.role === 'community_admin') return 3;
  if (user.role === 'admin') {
    return Array.isArray(user.gameAdminFor) && user.gameAdminFor.length > 0 ? 1 : 2;
  }
  return 0;
}

/** Devuelve true si `caller` tiene nivel estrictamente superior a `target`. */
export function canManageUser(caller, target) {
  if (!caller || !target) return false;
  if (caller.id && target.id && caller.id === target.id) return true; // uno mismo
  return adminLevel(caller) > adminLevel(target);
}

/**
 * Devuelve el participantId del user EN una comunidad concreta.
 * Multi-comunidad: el user tiene un participant distinto por comunidad
 * (hogar = participantId; extras = participantByCommunity del JWT).
 */
export function participantIdFor(user, communityId) {
  if (!user || !communityId) return user?.participantId ?? null;
  if (user.communityId === communityId) return user.participantId ?? null;
  return user.participantByCommunity?.[communityId] ?? null;
}
