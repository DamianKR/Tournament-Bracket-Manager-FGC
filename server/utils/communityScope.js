/**
 * Community scope helpers
 *
 * All list routes should filter by an explicit `communityId` query param when
 * the request comes from a community-scoped page. Superadmins can view every
 * community, but they still receive the same filtered dataset as regular users
 * when a community is requested, so the UI never mixes data from two
 * communities.
 *
 * ── Modelo de roles (post-refactor membership) ─────────────────────────────
 * `user.role` es el ÚNICO rol GLOBAL posible: 'superadmin' o null/undefined.
 * Cualquier otro rol ('community_admin', 'admin', 'user') vive en
 * `user.memberships[].role`, uno por comunidad. Un usuario puede ser
 * `community_admin` en una comunidad y `user` en otra.
 *
 * `user.memberships[]` = { participantId, communityId, isActive, role, gameAdminFor }
 * La comunidad "home" (`user.communityId`/`user.participantId`) es también una
 * membership como cualquier otra — debe existir siempre una entrada en
 * `memberships` para ella (ver server/routes/auth.js POST /users).
 *
 * Todas las funciones de este archivo son la ÚNICA fuente de verdad para
 * autorización. Nadie debe leer `user.role`/`user.gameAdminFor` directamente
 * fuera de aquí (salvo para detectar superadmin).
 */

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';
const COMMUNITY_ROLES = ['user', 'admin', 'community_admin'];

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
 * Devuelve el participantId del user EN una comunidad concreta.
 * Multi-comunidad: el user tiene un participant distinto por comunidad
 * (hogar = participantId; extras = participantByCommunity del JWT, o memberships).
 */
export function participantIdFor(user, communityId) {
  if (!user || !communityId) return user?.participantId ?? null;
  if (user.communityId === communityId) return user.participantId ?? null;
  if (user.participantByCommunity?.[communityId]) return user.participantByCommunity[communityId];
  const m = (user.memberships ?? []).find(m => m.communityId === communityId && m.isActive !== false);
  return m?.participantId ?? null;
}

// ── Membership-based role helpers ──────────────────────────────────────────

/** Devuelve la membership activa del usuario en una comunidad, o null. */
export function getMembership(user, communityId) {
  if (!user || !communityId) return null;
  if (user.communityId === communityId) {
    // La comunidad home también debe tener membership propia (ver auth.js),
    // pero por compatibilidad con datos viejos, si no existe la sintetizamos.
    const explicit = (user.memberships ?? []).find(m => m.communityId === communityId);
    if (explicit) return explicit.isActive === false ? null : explicit;
    return { participantId: user.participantId, communityId, isActive: true, role: 'user', gameAdminFor: [] };
  }
  const m = (user.memberships ?? []).find(m => m.communityId === communityId);
  if (!m || m.isActive === false) return null;
  return m;
}

/**
 * Rol efectivo del usuario en una comunidad concreta.
 * - superadmin es siempre 'superadmin' en cualquier comunidad.
 * - si no hay membership activa, devuelve null (no es miembro).
 */
export function communityRole(user, communityId) {
  if (!user) return null;
  if (user.role === 'superadmin') return 'superadmin';
  const m = getMembership(user, communityId);
  if (!m) return null;
  return COMMUNITY_ROLES.includes(m.role) ? m.role : 'user';
}

/** Juegos que administra dentro de una comunidad (solo aplica a role 'admin'; [] = todos). */
export function gameAdminForInCommunity(user, communityId) {
  if (!user || user.role === 'superadmin') return [];
  const m = getMembership(user, communityId);
  if (!m || m.role !== 'admin') return [];
  return Array.isArray(m.gameAdminFor) ? m.gameAdminFor : [];
}

/** true si es superadmin o community_admin DE esa comunidad. */
export function isCommunityAdmin(user, communityId) {
  const role = communityRole(user, communityId);
  return role === 'superadmin' || role === 'community_admin';
}

/** true si tiene cualquier nivel de admin (con o sin scope de juego) en esa comunidad. */
export function isAdminInCommunity(user, communityId) {
  const role = communityRole(user, communityId);
  return role === 'superadmin' || role === 'community_admin' || role === 'admin';
}

/**
 * true si el usuario es admin de ALGUNA comunidad (o superadmin). Gate grueso
 * para middlewares de ruta que todavía no conocen el recurso concreto.
 */
export function isAdminSomewhere(user) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return (user.memberships ?? []).some(
    m => m.isActive !== false && (m.role === 'admin' || m.role === 'community_admin')
  );
}

/**
 * Permisos de administración por juego DENTRO de una comunidad.
 * - superadmin / community_admin de esa comunidad → todos los juegos.
 * - admin sin `gameAdminFor` → todos los juegos (comportamiento heredado).
 * - admin con `gameAdminFor` → solo los juegos listados ("game admin").
 * - user / no-miembro → nunca.
 */
export function canAdminGame(user, communityId, gameId) {
  if (!user || !communityId) return false;
  const role = communityRole(user, communityId);
  if (role === 'superadmin' || role === 'community_admin') return true;
  if (role === 'admin') {
    const scope = gameAdminForInCommunity(user, communityId);
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
export function adminLevelInCommunity(user, communityId) {
  const role = communityRole(user, communityId);
  if (role === 'superadmin') return 4;
  if (role === 'community_admin') return 3;
  if (role === 'admin') {
    return gameAdminForInCommunity(user, communityId).length > 0 ? 1 : 2;
  }
  if (role === 'user') return 0;
  return -1;
}

/** true si `caller` puede administrar/editar a `target` DENTRO de una comunidad concreta. */
export function canManageUserInCommunity(caller, target, communityId) {
  if (!caller || !target) return false;
  if (caller.id && target.id && caller.id === target.id) return true; // uno mismo
  return adminLevelInCommunity(caller, communityId) > adminLevelInCommunity(target, communityId);
}

/**
 * true si `caller` supera a `target` en ALGUNA comunidad donde ambos coinciden
 * y el caller tiene acceso admin. Usado para acciones globales de cuenta
 * (borrar cuenta) donde no hay un communityId explícito en la request.
 */
export function canManageUserAnyCommunity(caller, target) {
  if (!caller || !target) return false;
  if (caller.id && target.id && caller.id === target.id) return true;
  if (caller.role === 'superadmin') return true;

  const targetCommunityIds = new Set();
  if (target.communityId) targetCommunityIds.add(target.communityId);
  for (const m of target.memberships ?? []) {
    if (m.isActive !== false) targetCommunityIds.add(m.communityId);
  }

  for (const cid of targetCommunityIds) {
    if (!isInUserScope(caller, cid)) continue;
    if (adminLevelInCommunity(caller, cid) > adminLevelInCommunity(target, cid)) return true;
  }
  return false;
}
