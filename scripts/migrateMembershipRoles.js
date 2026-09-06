/**
 * One-time migration:
 *   - Moves user.role and user.gameAdminFor into the user's home membership.
 *   - Leaves user.role only as 'superadmin' for real superadmins.
 *   - Ensures every community owner has a community_admin membership.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '..', 'data');

const usersPath = path.join(dataDir, 'users.json');
const communitiesPath = path.join(dataDir, 'communities.json');

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function migrateUsers(users) {
  for (const u of users) {
    if (!Array.isArray(u.memberships)) u.memberships = [];

    if (u.role === 'superadmin') {
      // superadmin conserva su rol global; membership opcional
      continue;
    }

    const homeCommunityId = u.communityId || DEFAULT_COMMUNITY_ID;
    const legacyRole = u.role && u.role !== 'user' ? u.role : null;
    const legacyGames = Array.isArray(u.gameAdminFor) ? u.gameAdminFor : [];

    let homeMembership = u.memberships.find((m) => m.communityId === homeCommunityId);

    if (!homeMembership) {
      homeMembership = {
        participantId: u.participantId,
        communityId: homeCommunityId,
        isActive: true,
      };
      u.memberships.push(homeMembership);
    }

    // Sincronizar home membership con rol legacy si existía
    if (legacyRole) {
      homeMembership.role = legacyRole; // community_admin | admin
      if (legacyGames.length > 0) homeMembership.gameAdminFor = legacyGames;
    }

    // Asegurar que todas las memberships tengan role y gameAdminFor
    for (const m of u.memberships) {
      if (m.role == null) m.role = 'user';
      if (!Array.isArray(m.gameAdminFor)) m.gameAdminFor = [];
    }

    // El rol global desaparece para no superadmins
    u.role = null;
    // gameAdminFor global ya no aplica; se lee de memberships
    u.gameAdminFor = [];
  }
  return users;
}

function migrateCommunities(communities, users) {
  for (const c of communities) {
    const ownerId = c.ownerAdminId;
    if (!ownerId) continue;
    const owner = users.find((u) => u.id === ownerId);
    if (!owner) continue;
    // ownerAdminId a veces es solo "quién la creó" (p.ej. un superadmin de paso).
    // Un superadmin no necesita membership; forzarle una sería ruido y confusión.
    if (owner.role === 'superadmin') continue;

    let membership = owner.memberships.find((m) => m.communityId === c.id);
    if (!membership) {
      membership = {
        participantId: owner.participantId,
        communityId: c.id,
        isActive: true,
        role: 'community_admin',
        gameAdminFor: [],
      };
      owner.memberships.push(membership);
    } else {
      if (membership.role !== 'community_admin') membership.role = 'community_admin';
      if (!Array.isArray(membership.gameAdminFor)) membership.gameAdminFor = [];
      membership.isActive = true;
    }
  }
  return communities;
}

const users = readJSON(usersPath);
const communities = readJSON(communitiesPath);

migrateUsers(users);
migrateCommunities(communities, users);

writeJSON(usersPath, users);
writeJSON(communitiesPath, communities);

console.log('Migration complete.');
