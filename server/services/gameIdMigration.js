/**
 * Game ID Migration
 *
 * Backfills `gameId` on legacy records that were created before multi-game support:
 *   - tournaments
 *   - leagues
 *   - duels
 *   - tournament_matches (from parent tournament)
 *   - league_matches    (from parent league)
 *   - ranked_matches    (from linked duel, otherwise default)
 *
 * After a successful run it writes a marker so it does not run again.
 */

import { tournaments, leagues, duels, tournamentMatches, leagueMatches, rankedMatches, migrations } from '../db/collections.js';

const MIGRATION_KEY = 'game_id_migration_v1';
const DEFAULT_GAME_ID = 'ssbu';

export async function migrateGameIds() {
  try {
    let marker = null;
    try {
      marker = await migrations.findById(MIGRATION_KEY);
    } catch (err) {
      console.warn('[GameIdMigration] Could not read migration marker:', err.message);
    }
    if (marker?.applied) {
      console.log('[GameIdMigration] Already applied, skipping.');
      return;
    }

    const now = new Date().toISOString();
    const allTournaments = await tournaments.getAll();
    const allLeagues = await leagues.getAll();
    const allDuels = await duels.getAll();

    // Maps for match-level inheritance
    const tournamentGameMap = new Map(allTournaments.map(t => [t.id, t.gameId]));
    const leagueGameMap = new Map(allLeagues.map(l => [l.id, l.gameId]));
    const duelGameMap = new Map(allDuels.map(d => [d.id, d.gameId]));

    let count = 0;

    for (const t of allTournaments) {
      if (!t.gameId) {
        t.gameId = DEFAULT_GAME_ID;
        t.updatedAt = now;
        await tournaments.upsert(t);
        count++;
      }
    }

    for (const l of allLeagues) {
      if (!l.gameId) {
        l.gameId = DEFAULT_GAME_ID;
        l.updatedAt = now;
        await leagues.upsert(l);
        count++;
      }
    }

    for (const d of allDuels) {
      if (!d.gameId) {
        d.gameId = DEFAULT_GAME_ID;
        d.updatedAt = now;
        await duels.upsert(d);
        count++;
      }
    }

    const allTournamentMatches = await tournamentMatches.getAll();
    for (const m of allTournamentMatches) {
      if (!m.gameId) {
        m.gameId = tournamentGameMap.get(m.tournamentId) || DEFAULT_GAME_ID;
        m.updatedAt = now;
        await tournamentMatches.upsert(m);
        count++;
      }
    }

    const allLeagueMatches = await leagueMatches.getAll();
    for (const m of allLeagueMatches) {
      if (!m.gameId) {
        m.gameId = leagueGameMap.get(m.leagueId) || DEFAULT_GAME_ID;
        m.updatedAt = now;
        await leagueMatches.upsert(m);
        count++;
      }
    }

    const allRankedMatches = await rankedMatches.getAll();
    for (const m of allRankedMatches) {
      if (!m.gameId) {
        m.gameId = duelGameMap.get(m.duelId) || DEFAULT_GAME_ID;
        m.updatedAt = now;
        await rankedMatches.upsert(m);
        count++;
      }
    }

    if (count > 0) {
      console.log(`[GameIdMigration] Backfilled gameId on ${count} records`);
    } else {
      console.log('[GameIdMigration] No records need gameId migration');
    }

    try {
      await migrations.upsert({
        id: MIGRATION_KEY,
        applied: true,
        appliedAt: new Date().toISOString(),
      });
      console.log('[GameIdMigration] Migration marked as applied.');
    } catch (err) {
      console.warn('[GameIdMigration] Could not write migration marker:', err.message);
    }
  } catch (err) {
    console.error('[GameIdMigration] Failed:', err);
  }
}
