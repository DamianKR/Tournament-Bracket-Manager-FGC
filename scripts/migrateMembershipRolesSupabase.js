/**
 * migrateMembershipRolesSupabase.js — Migración de roles a memberships EN SUPABASE
 *
 * Mismo algoritmo que migrateMembershipRoles.js pero leyendo/escribiendo las
 * tablas `users` y `communities` de Supabase (formato { id, data: JSONB }).
 * Idempotente: se puede ejecutar varias veces sin romper nada.
 *
 * Uso:
 *   node --env-file=.env.local scripts/migrateMembershipRolesSupabase.js          (aplica)
 *   node --env-file=.env.local scripts/migrateMembershipRolesSupabase.js --dry    (solo reporta)
 *
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_KEY en .env.local
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY_RUN = process.argv.includes('--dry');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('id, data');
  if (error) throw new Error(`[${table}] ${error.message}`);
  return data.map((r) => ({ _rowId: r.id, ...r.data }));
}

function migrateUsers(users) {
  let changed = 0;
  for (const u of users) {
    if (!Array.isArray(u.memberships)) u.memberships = [];

    if (u.role === 'superadmin') {
      // superadmin conserva su rol global; memberships opcionales con shape correcto
      for (const m of u.memberships) {
        if (m.role == null) { m.role = 'user'; changed++; }
        if (!Array.isArray(m.gameAdminFor)) { m.gameAdminFor = []; changed++; }
      }
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
      changed++;
    }

    if (legacyRole) {
      if (homeMembership.role !== legacyRole) { homeMembership.role = legacyRole; changed++; }
      if (legacyGames.length > 0 && !Array.isArray(homeMembership.gameAdminFor)) {
        homeMembership.gameAdminFor = legacyGames; changed++;
      } else if (legacyGames.length > 0) {
        homeMembership.gameAdminFor = legacyGames; changed++;
      }
    }

    for (const m of u.memberships) {
      if (m.role == null) { m.role = 'user'; changed++; }
      if (!Array.isArray(m.gameAdminFor)) { m.gameAdminFor = []; changed++; }
    }

    if (u.role !== null) { u.role = null; changed++; }
    if (!Array.isArray(u.gameAdminFor) || u.gameAdminFor.length > 0) { u.gameAdminFor = []; changed++; }
  }
  return changed;
}

function migrateCommunities(communities, users) {
  let changed = 0;
  for (const c of communities) {
    const ownerId = c.ownerAdminId;
    if (!ownerId) continue;
    const owner = users.find((u) => u.id === ownerId);
    if (!owner || owner.role === 'superadmin') continue;

    let membership = owner.memberships.find((m) => m.communityId === c.id);
    if (!membership) {
      owner.memberships.push({
        participantId: owner.participantId,
        communityId: c.id,
        isActive: true,
        role: 'community_admin',
        gameAdminFor: [],
      });
      changed++;
    } else {
      if (membership.role !== 'community_admin') { membership.role = 'community_admin'; changed++; }
      if (!Array.isArray(membership.gameAdminFor)) { membership.gameAdminFor = []; changed++; }
      if (membership.isActive === false) { membership.isActive = true; changed++; }
    }
  }
  return changed;
}

async function main() {
  console.log('');
  console.log(`  Membership roles migration → Supabase ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log(`  URL: ${SUPABASE_URL}`);
  console.log('');

  const users = await fetchAll('users');
  const communities = await fetchAll('communities');
  console.log(`  Leídos: ${users.length} users, ${communities.length} communities`);

  const userChanges = migrateUsers(users);
  const ownerChanges = migrateCommunities(communities, users);

  const stats = {
    total: users.length,
    conMemberships: users.filter((u) => u.memberships.length > 0).length,
    conRoleGlobal: users.filter((u) => u.role && u.role !== 'superadmin').length,
    communityAdmins: users.filter((u) => u.memberships.some((m) => m.role === 'community_admin')).length,
    scopedAdmins: users.filter((u) => u.memberships.some((m) => (m.gameAdminFor ?? []).length > 0)).length,
  };
  console.log(`  Cambios: ${userChanges + ownerChanges} campos modificados`);
  console.log(`  Resultado:`, JSON.stringify(stats));

  if (DRY_RUN) {
    console.log('\n  DRY RUN — no se escribió nada. Corre sin --dry para aplicar.\n');
    return;
  }

  // Upsert users en lotes (solo los que tienen memberships ahora o cambiaron)
  const rows = users.map((u) => {
    const { _rowId, ...data } = u;
    return { id: _rowId ?? u.id, data };
  });
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('users').upsert(rows.slice(i, i + BATCH), { onConflict: 'id' });
    if (error) throw new Error(`[users] upsert: ${error.message}`);
  }
  console.log(`  ✅ ${rows.length} users escritos en Supabase`);
  console.log('  (communities no se modifican — solo se leen para resolver owners)\n');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
