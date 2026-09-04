/**
 * Participant Game Profile Migration
 *
 * Migrates legacy single-game participant data (top-level gameId, eloPoints,
 * eloRank, mainCharacterId) into the per-game `games` object.
 *
 * After a successful run it writes a marker so it does not run again.
 */

import { participants, migrations } from '../db/collections.js';
import { migrateParticipantGames } from '../utils/participantGames.js';

const MIGRATION_KEY = 'participant_game_migration_v1';

function hasProfileIssues(p) {
  if (!p.games) return true;
  if (p.eloPoints !== undefined || p.eloRank !== undefined) return true;
  if (p.gameId && !p.games[p.gameId]) return true;
  for (const profile of Object.values(p.games || {})) {
    if (profile.eloRank === 'Sin puntos' && profile.eloPoints !== null) return true;
  }
  return false;
}

export async function migrateParticipantGameProfiles() {
  try {
    let marker = null;
    try {
      marker = await migrations.findById(MIGRATION_KEY);
    } catch (err) {
      console.warn('[ParticipantGameMigration] Could not read migration marker:', err.message);
    }
    if (marker?.applied) {
      console.log('[ParticipantGameMigration] Already applied, skipping.');
      return;
    }

    const all = await participants.getAll();
    let migratedCount = 0;

    for (const raw of all) {
      if (!hasProfileIssues(raw)) continue;

      const p = migrateParticipantGames({ ...raw });

      // Fix participants incorrectly defaulted to points while still "Sin puntos"
      for (const profile of Object.values(p.games || {})) {
        if (profile.eloRank === 'Sin puntos' && profile.eloPoints !== null) {
          profile.eloPoints = null;
        }
      }

      p.updatedAt = new Date().toISOString();
      await participants.upsert(p);
      migratedCount++;
    }

    if (migratedCount > 0) {
      console.log(`[ParticipantGameMigration] Migrated ${migratedCount} participants to per-game profiles`);
    } else {
      console.log('[ParticipantGameMigration] No participants need migration');
    }

    try {
      await migrations.upsert({
        id: MIGRATION_KEY,
        applied: true,
        appliedAt: new Date().toISOString(),
      });
      console.log('[ParticipantGameMigration] Migration marked as applied.');
    } catch (err) {
      console.warn('[ParticipantGameMigration] Could not write migration marker:', err.message);
    }
  } catch (err) {
    console.error('[ParticipantGameMigration] Failed:', err);
  }
}
