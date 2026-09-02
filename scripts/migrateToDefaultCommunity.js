/**
 * migrateToDefaultCommunity.js
 *
 * Script de migración para producción.
 *
 * PROBLEMA que resuelve:
 *   En Supabase, la tabla `communities` estaba vacía (no estaba en el import
 *   original). Todos los demás registros (participants, users, tournaments,
 *   leagues, matches, duels…) ya tienen communityId apuntando a
 *   "community_fgc_santa_clara" desde cuando se importaron del JSON local,
 *   pero la comunidad en sí no existía en la DB → la app no podía cargar nada.
 *
 * QUÉ HACE:
 *   1. Crea la comunidad "FGC Santa Clara" (community_fgc_santa_clara) si no existe.
 *   2. Busca el superadmin y lo asigna como ownerAdminId de esa comunidad.
 *   3. Recorre todas las colecciones y asigna communityId a registros que
 *      no lo tengan (null / undefined).  Los que ya lo tienen NO se tocan.
 *   4. El superadmin siempre queda con communityId: null (es global).
 *
 * USO:
 *   # Contra Supabase (producción):
 *   STORAGE_BACKEND=supabase node --env-file=.env.local scripts/migrateToDefaultCommunity.js
 *
 *   # Contra JSON local (para verificar antes de subir):
 *   node scripts/migrateToDefaultCommunity.js
 *
 * IDEMPOTENTE: puedes ejecutarlo varias veces sin riesgo.
 */

import {
  communities,
  participants,
  users,
  tournaments,
  leagues,
  tournamentMatches,
  leagueMatches,
  rankedMatches,
  duels,
  duelSettings,
} from '../server/db/collections.js';

// ─── Datos de la comunidad por defecto ────────────────────────────────────────

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * Asegura que la comunidad por defecto existe.
 * Si ya existe la deja intacta (idempotente).
 * Si no existe la crea y asigna como owner al superadmin (o admin) existente.
 */
async function ensureCommunity() {
  const existing = await communities.findById(DEFAULT_COMMUNITY_ID);

  if (existing) {
    console.log(`  ✓  Comunidad "${existing.name}" ya existe — no se modifica.`);
    return existing;
  }

  // Buscar el superadmin (o admin como fallback)
  const allUsers = await users.getAll();
  const owner =
    allUsers.find((u) => u.role === 'superadmin') ||
    allUsers.find((u) => u.role === 'community_admin') ||
    allUsers.find((u) => u.role === 'admin') ||
    null;

  const community = {
    id:          DEFAULT_COMMUNITY_ID,
    name:        'FGC Santa Clara',
    shortName:   'FGC SC',
    description: 'Comunidad inicial por defecto',
    ownerAdminId: owner?.id ?? null,
    createdAt:   '2026-09-01T00:00:00.000Z',
    updatedAt:   now(),
  };

  await communities.upsert(community);
  console.log(`  ✅ Comunidad "${community.name}" creada.`);
  console.log(`     id:           ${community.id}`);
  console.log(`     ownerAdminId: ${community.ownerAdminId ?? '(ninguno)'}`);
  return community;
}

/**
 * Recorre una colección y asigna DEFAULT_COMMUNITY_ID a los registros
 * que tengan communityId null/undefined.
 *
 * @param {object} col        — colección del adapter (jsonDb o supabaseDb)
 * @param {string} label      — nombre para el log
 * @param {string[]} skipRoles — roles que NO se tocan (ej. superadmin)
 */
async function assignCommunityId(col, label, skipRoles = []) {
  const all = await col.getAll();
  const toUpdate = all.filter((r) => {
    if (r.communityId)                   return false;  // ya tiene → skip
    if (skipRoles.includes(r.role))      return false;  // rol excluido → skip
    return true;
  });

  if (toUpdate.length === 0) {
    console.log(`  ✓  ${label}: todos los registros ya tienen communityId.`);
    return 0;
  }

  console.log(`  →  ${label}: ${toUpdate.length} registros sin communityId — asignando...`);

  for (const record of toUpdate) {
    record.communityId = DEFAULT_COMMUNITY_ID;
    record.updatedAt   = now();
    await col.upsert(record);
  }

  console.log(`  ✅ ${label}: ${toUpdate.length} registros actualizados.`);
  return toUpdate.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.env.STORAGE_BACKEND === 'supabase' ? 'Supabase (producción)' : 'JSON local';

  console.log('');
  console.log('  ══════════════════════════════════════════════════════════');
  console.log('  Bracket Project — Migración a comunidad por defecto');
  console.log(`  Modo: ${mode}`);
  console.log('  ══════════════════════════════════════════════════════════');
  console.log('');

  // ── Paso 1: crear/verificar la comunidad ──────────────────────────────
  console.log('  [1/9] Comunidad por defecto...');
  await ensureCommunity();
  console.log('');

  // ── Paso 2-10: asignar communityId donde falte ────────────────────────
  // El superadmin siempre tiene communityId: null (es global, no pertenece a ninguna).
  console.log('  [2/10] participants...');
  await assignCommunityId(participants, 'participants');

  console.log('  [3/10] users (superadmin queda con null)...');
  await assignCommunityId(users, 'users', ['superadmin']);

  console.log('  [4/10] tournaments...');
  await assignCommunityId(tournaments, 'tournaments');

  console.log('  [5/10] leagues...');
  await assignCommunityId(leagues, 'leagues');

  console.log('  [6/10] tournament_matches...');
  await assignCommunityId(tournamentMatches, 'tournament_matches');

  console.log('  [7/10] league_matches (puede tardar si hay miles)...');
  await assignCommunityId(leagueMatches, 'league_matches');

  console.log('  [8/10] ranked_matches...');
  await assignCommunityId(rankedMatches, 'ranked_matches');

  console.log('  [9/10] duels...');
  await assignCommunityId(duels, 'duels');

  console.log('  [10/10] duel_settings...');
  await assignCommunityId(duelSettings, 'duel_settings');

  console.log('');
  console.log('  ══════════════════════════════════════════════════════════');
  console.log('  ✅ Migración completada correctamente.');
  console.log('');
  console.log('  Próximos pasos:');
  console.log('  1. Verifica en Supabase Dashboard → Table Editor → communities');
  console.log('     que aparece "FGC Santa Clara".');
  console.log('  2. Haz deploy del backend en Render para que entre en vigor');
  console.log('     el fix del supabaseDb (paginación + getByField).');
  console.log('  3. (Opcional) Activa el índice idx_league_matches_league en el SQL');
  console.log('     editor de Supabase para mayor velocidad en la vista de schedule.');
  console.log('  ══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error('  ❌ Error fatal:', err.message);
  console.error('');
  process.exit(1);
});
