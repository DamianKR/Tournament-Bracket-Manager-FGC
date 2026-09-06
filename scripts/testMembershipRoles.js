/**
 * Tests de los helpers membership-based de server/utils/communityScope.js
 *
 * Ejecutar:  node scripts/testMembershipRoles.js
 *
 * Cubre las reglas clave del refactor de roles por membership:
 *  - superadmin es global y gana en cualquier comunidad
 *  - el rol vive en memberships, uno por comunidad
 *  - gameAdminFor es por comunidad
 *  - jerarquía por comunidad (canManageUserInCommunity)
 *  - isInUserScope reconoce memberships activas
 */

import assert from 'node:assert/strict';
import {
  getMembership,
  communityRole,
  gameAdminForInCommunity,
  isCommunityAdmin,
  isAdminInCommunity,
  isAdminSomewhere,
  canAdminGame,
  adminLevelInCommunity,
  canManageUserInCommunity,
  isInUserScope,
  participantIdFor,
} from '../server/utils/communityScope.js';

const C_A = 'community_A';
const C_B = 'community_B';

const superadmin = { id: 'u_sa', role: 'superadmin', memberships: [] };

// Admin de A, user de B
const multi = {
  id: 'u_multi',
  role: null,
  communityId: C_A,
  participantId: 'p_A',
  memberships: [
    { participantId: 'p_A', communityId: C_A, isActive: true, role: 'admin', gameAdminFor: ['ssbu'] },
    { participantId: 'p_B', communityId: C_B, isActive: true, role: 'user', gameAdminFor: [] },
  ],
};

const communityAdminA = {
  id: 'u_owner',
  role: null,
  communityId: C_A,
  participantId: 'p_owner',
  memberships: [
    { participantId: 'p_owner', communityId: C_A, isActive: true, role: 'community_admin', gameAdminFor: [] },
  ],
};

const plainUserA = {
  id: 'u_plain',
  role: null,
  communityId: C_A,
  participantId: 'p_plain',
  memberships: [
    { participantId: 'p_plain', communityId: C_A, isActive: true, role: 'user', gameAdminFor: [] },
  ],
};

const inactiveMember = {
  id: 'u_inactive',
  role: null,
  memberships: [
    { participantId: 'p_x', communityId: C_B, isActive: false, role: 'admin', gameAdminFor: [] },
  ],
};

// ── getMembership / communityRole ──────────────────────────────────────────
assert.equal(communityRole(superadmin, C_A), 'superadmin');
assert.equal(communityRole(superadmin, C_B), 'superadmin');
assert.equal(communityRole(multi, C_A), 'admin');
assert.equal(communityRole(multi, C_B), 'user');
assert.equal(communityRole(communityAdminA, C_A), 'community_admin');
assert.equal(communityRole(plainUserA, C_A), 'user');
assert.equal(communityRole(plainUserA, C_B), null);
assert.equal(communityRole(inactiveMember, C_B), null);
assert.equal(communityRole(null, C_A), null);

// Home community sin membership explícita → sintetiza 'user' (compatibilidad)
const legacyHome = { id: 'u_leg', role: null, communityId: C_A, participantId: 'p_leg' };
assert.equal(communityRole(legacyHome, C_A), 'user');
assert.equal(communityRole(legacyHome, C_B), null);

// ── gameAdminForInCommunity / canAdminGame ─────────────────────────────────
assert.deepEqual(gameAdminForInCommunity(multi, C_A), ['ssbu']);
assert.deepEqual(gameAdminForInCommunity(multi, C_B), []);
assert.equal(canAdminGame(multi, C_A, 'ssbu'), true);
assert.equal(canAdminGame(multi, C_A, 'sf6'), false);
assert.equal(canAdminGame(multi, C_B, 'ssbu'), false); // user en B
assert.equal(canAdminGame(communityAdminA, C_A, 'sf6'), true);
assert.equal(canAdminGame(superadmin, C_B, 'sf6'), true);

const unscopedAdmin = {
  id: 'u_all',
  role: null,
  memberships: [{ participantId: 'p', communityId: C_A, isActive: true, role: 'admin', gameAdminFor: [] }],
};
assert.equal(canAdminGame(unscopedAdmin, C_A, 'sf6'), true); // sin scope = todos

// ── isCommunityAdmin / isAdminInCommunity / isAdminSomewhere ───────────────
assert.equal(isCommunityAdmin(communityAdminA, C_A), true);
assert.equal(isCommunityAdmin(multi, C_A), false); // admin, no owner
assert.equal(isCommunityAdmin(multi, C_B), false);
assert.equal(isCommunityAdmin(superadmin, C_B), true);
assert.equal(isAdminInCommunity(multi, C_A), true);
assert.equal(isAdminInCommunity(multi, C_B), false);
assert.equal(isAdminInCommunity(plainUserA, C_A), false);
assert.equal(isAdminSomewhere(multi), true);
assert.equal(isAdminSomewhere(plainUserA), false);
assert.equal(isAdminSomewhere(inactiveMember), false); // membresía inactiva no cuenta

// ── Jerarquía / canManageUserInCommunity ───────────────────────────────────
assert.equal(adminLevelInCommunity(superadmin, C_A), 4);
assert.equal(adminLevelInCommunity(communityAdminA, C_A), 3);
assert.equal(adminLevelInCommunity(unscopedAdmin, C_A), 2);
assert.equal(adminLevelInCommunity(multi, C_A), 1); // admin scopado
assert.equal(adminLevelInCommunity(plainUserA, C_A), 0);
assert.equal(adminLevelInCommunity(plainUserA, C_B), -1);

assert.equal(canManageUserInCommunity(communityAdminA, plainUserA, C_A), true);
assert.equal(canManageUserInCommunity(communityAdminA, multi, C_A), true);
assert.equal(canManageUserInCommunity(multi, plainUserA, C_A), true);
assert.equal(canManageUserInCommunity(multi, communityAdminA, C_A), false); // admin < owner
assert.equal(canManageUserInCommunity(communityAdminA, superadmin, C_A), false);
assert.equal(canManageUserInCommunity(multi, multi, C_A), true); // uno mismo
assert.equal(canManageUserInCommunity(plainUserA, multi, C_A), false);
// Un admin de B que es user en A no gestiona a nadie en A
const adminBuserA = {
  id: 'u_ab', role: null,
  memberships: [
    { participantId: 'p', communityId: C_B, isActive: true, role: 'admin' },
    { participantId: 'p2', communityId: C_A, isActive: true, role: 'user' },
  ],
};
assert.equal(canManageUserInCommunity(adminBuserA, plainUserA, C_A), false);
// En B el caller sí es admin (nivel 2) y el target no es miembro (nivel -1):
// la jerarquía lo permite — el scope de juego se valida aparte en las rutas.
assert.equal(canManageUserInCommunity(adminBuserA, plainUserA, C_B), true);

// ── isInUserScope / participantIdFor ───────────────────────────────────────
assert.equal(isInUserScope(multi, C_A), true);
assert.equal(isInUserScope(multi, C_B), true); // membresía activa
assert.equal(isInUserScope(inactiveMember, C_B), false);
assert.equal(isInUserScope(superadmin, C_B), true);
assert.equal(isInUserScope(null, C_B), true); // lectura pública
assert.equal(participantIdFor(multi, C_B), 'p_B');
assert.equal(participantIdFor(multi, C_A), 'p_A');
assert.equal(participantIdFor(plainUserA, C_B), null);

console.log('✓ Todos los tests de membership roles pasaron.');
