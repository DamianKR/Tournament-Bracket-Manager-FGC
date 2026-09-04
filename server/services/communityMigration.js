/**
 * Community Migration
 *
 * Runs once per environment to:
 *  - Ensure a default community (FGC Santa Clara) exists only when the DB is empty.
 *  - Promote a superadmin only when none exists and there is a single community.
 *  - Backfill communityId/gameId on legacy records, but never overwrite valid data.
 *
 * After the first successful run it writes a marker so it does nothing on future startups.
 */

import { users, participants, communities, tournaments, leagues, duels, duelSettings, tournamentMatches, leagueMatches, rankedMatches, migrations } from '../db/collections.js';

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';
const DEFAULT_COMMUNITY_NAME = 'FGC Santa Clara';
const DEFAULT_SHORT_NAME = 'FGC SC';
const MIGRATION_KEY = 'default_community_migration_v1';

export async function ensureDefaultCommunityAndMigrate() {
  try {
    let marker = null;
    try {
      marker = await migrations.findById(MIGRATION_KEY);
    } catch (err) {
      console.warn('[CommunityMigration] Could not read migration marker (table/file may be missing):', err.message);
    }
    if (marker?.applied) {
      console.log('[CommunityMigration] Already applied, skipping.');
      return;
    }

    console.log('[CommunityMigration] Running one-time migration checks...');

    const allCommunities = await communities.getAll();
    const isSingleCommunity = allCommunities.length <= 1;

    // 1. Ensure the default community exists only when the DB is truly empty.
    let community = allCommunities.find(c => c.id === DEFAULT_COMMUNITY_ID);
    if (!community && allCommunities.length === 0) {
      community = {
        id: DEFAULT_COMMUNITY_ID,
        name: DEFAULT_COMMUNITY_NAME,
        shortName: DEFAULT_SHORT_NAME,
        description: 'Comunidad inicial por defecto',
        ownerAdminId: null,
        isPublic: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await communities.upsert(community);
      console.log(`[CommunityMigration] Created default community: ${DEFAULT_COMMUNITY_NAME}`);
    }

    const allUsers = await users.getAll();

    // 2. Promote a superadmin only if none exists and the data is still single-community.
    let superAdmin = allUsers.find(u => u.role === 'superadmin');
    if (!superAdmin) {
      if (!isSingleCommunity) {
        console.warn('[CommunityMigration] No superadmin found, but multiple communities exist. Skipping auto-promotion.');
      } else {
        const firstAdmin = allUsers.find(u => u.role === 'admin' || u.role === 'community_admin');
        const candidate = firstAdmin || allUsers[0];
        if (candidate) {
          candidate.role = 'superadmin';
          candidate.communityId = null;
          candidate.updatedAt = new Date().toISOString();
          await users.upsert(candidate);
          superAdmin = candidate;
          console.log(`[CommunityMigration] Promoted user ${candidate.username} (${candidate.id}) to superadmin`);
        }
      }
    }

    // 3. Backfill missing communityId on users, but only when there is a single community.
    let usersMigrated = 0;
    if (community && isSingleCommunity) {
      for (const user of allUsers) {
        if (!user.communityId && user.role !== 'superadmin') {
          user.communityId = DEFAULT_COMMUNITY_ID;
          user.updatedAt = new Date().toISOString();
          await users.upsert(user);
          usersMigrated++;
        }
      }
      if (usersMigrated > 0) {
        console.log(`[CommunityMigration] Migrated ${usersMigrated} users to ${DEFAULT_COMMUNITY_NAME}`);
      }
    }

    // 4. Set the default community owner only if it is missing.
    if (community && !community.ownerAdminId) {
      const owner =
        allUsers.find(u => u.communityId === community.id && (u.role === 'community_admin' || u.role === 'admin')) ||
        allUsers.find(u => u.role === 'community_admin') ||
        allUsers.find(u => u.role === 'admin');
      if (owner) {
        community.ownerAdminId = owner.id;
        community.updatedAt = new Date().toISOString();
        await communities.upsert(community);
        console.log(`[CommunityMigration] Set community owner: ${owner.username} (${owner.id})`);
      }
    }

    // 5. Backfill missing communityId on participants.
    const allParticipants = await participants.getAll();
    let participantsMigrated = 0;

    for (const participant of allParticipants) {
      if (community && isSingleCommunity && !participant.communityId) {
        participant.communityId = DEFAULT_COMMUNITY_ID;
        participant.updatedAt = new Date().toISOString();
        await participants.upsert(participant);
        participantsMigrated++;
      }
    }
    if (participantsMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${participantsMigrated} participants to ${DEFAULT_COMMUNITY_NAME}`);
    }

    // 6. Backfill communityId on collections, only when there is a single community.
    const now = new Date().toISOString();
    const fallbackCommunityId = (community && isSingleCommunity) ? community.id : null;

    const allTournaments = await tournaments.getAll();
    let tournamentsMigrated = 0;
    for (const t of allTournaments) {
      if (!t.communityId && fallbackCommunityId) {
        t.communityId = fallbackCommunityId;
        t.updatedAt = now;
        await tournaments.upsert(t);
        tournamentsMigrated++;
      }
    }
    if (tournamentsMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${tournamentsMigrated} tournaments`);
    }

    const allLeagues = await leagues.getAll();
    let leaguesMigrated = 0;
    for (const l of allLeagues) {
      if (!l.communityId && fallbackCommunityId) {
        l.communityId = fallbackCommunityId;
        l.updatedAt = now;
        await leagues.upsert(l);
        leaguesMigrated++;
      }
    }
    if (leaguesMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${leaguesMigrated} leagues`);
    }

    const allDuels = await duels.getAll();
    let duelsMigrated = 0;
    for (const d of allDuels) {
      if (!d.communityId && fallbackCommunityId) {
        d.communityId = fallbackCommunityId;
        d.updatedAt = now;
        await duels.upsert(d);
        duelsMigrated++;
      }
    }
    if (duelsMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${duelsMigrated} duels`);
    }

    const allDuelSettings = await duelSettings.getAll();
    let duelSettingsMigrated = 0;
    for (const s of allDuelSettings) {
      if (!s.communityId && fallbackCommunityId) {
        s.communityId = fallbackCommunityId;
        s.updatedAt = now;
        await duelSettings.upsert(s);
        duelSettingsMigrated++;
      }
    }
    if (duelSettingsMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${duelSettingsMigrated} duel settings`);
    }

    // 7. Inherit communityId for match records from their parents.
    const leagueCommunityMap = new Map(allLeagues.map(l => [l.id, l.communityId]));
    const tournamentCommunityMap = new Map(allTournaments.map(t => [t.id, t.communityId]));
    const participantCommunityMap = new Map(allParticipants.map(p => [p.id, p.communityId]));

    const allLeagueMatches = await leagueMatches.getAll();
    let leagueMatchesMigrated = 0;
    for (const m of allLeagueMatches) {
      if (!m.communityId) {
        const parentCommunity = leagueCommunityMap.get(m.leagueId);
        if (parentCommunity || fallbackCommunityId) {
          m.communityId = parentCommunity || fallbackCommunityId;
          m.updatedAt = now;
          await leagueMatches.upsert(m);
          leagueMatchesMigrated++;
        }
      }
    }
    if (leagueMatchesMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${leagueMatchesMigrated} league matches`);
    }

    const allTournamentMatches = await tournamentMatches.getAll();
    let tournamentMatchesMigrated = 0;
    for (const m of allTournamentMatches) {
      if (!m.communityId) {
        const parentCommunity = tournamentCommunityMap.get(m.tournamentId);
        if (parentCommunity || fallbackCommunityId) {
          m.communityId = parentCommunity || fallbackCommunityId;
          m.updatedAt = now;
          await tournamentMatches.upsert(m);
          tournamentMatchesMigrated++;
        }
      }
    }
    if (tournamentMatchesMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${tournamentMatchesMigrated} tournament matches`);
    }

    const allRankedMatches = await rankedMatches.getAll();
    let rankedMatchesMigrated = 0;
    for (const m of allRankedMatches) {
      if (!m.communityId) {
        const p1Community = participantCommunityMap.get(m.playerAId);
        const p2Community = participantCommunityMap.get(m.playerBId);
        if (p1Community || p2Community || fallbackCommunityId) {
          m.communityId = p1Community || p2Community || fallbackCommunityId;
          m.updatedAt = now;
          await rankedMatches.upsert(m);
          rankedMatchesMigrated++;
        }
      }
    }
    if (rankedMatchesMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${rankedMatchesMigrated} ranked matches`);
    }

    // 8. Backfill default gameId on legacy records.
    const DEFAULT_GAME_ID = 'ssbu';
    const leagueGameMap = new Map(allLeagues.map(l => [l.id, l.gameId]));
    const tournamentGameMap = new Map(allTournaments.map(t => [t.id, t.gameId]));

    let tournamentsGameMigrated = 0;
    for (const t of allTournaments) {
      if (!t.gameId) {
        t.gameId = DEFAULT_GAME_ID;
        t.updatedAt = now;
        await tournaments.upsert(t);
        tournamentsGameMigrated++;
      }
    }
    if (tournamentsGameMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${tournamentsGameMigrated} tournaments to default game ${DEFAULT_GAME_ID}`);
    }

    let leaguesGameMigrated = 0;
    for (const l of allLeagues) {
      if (!l.gameId) {
        l.gameId = DEFAULT_GAME_ID;
        l.updatedAt = now;
        await leagues.upsert(l);
        leaguesGameMigrated++;
      }
    }
    if (leaguesGameMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${leaguesGameMigrated} leagues to default game ${DEFAULT_GAME_ID}`);
    }

    let leagueMatchesGameMigrated = 0;
    for (const m of allLeagueMatches) {
      if (!m.gameId) {
        m.gameId = leagueGameMap.get(m.leagueId) || DEFAULT_GAME_ID;
        m.updatedAt = now;
        await leagueMatches.upsert(m);
        leagueMatchesGameMigrated++;
      }
    }
    if (leagueMatchesGameMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${leagueMatchesGameMigrated} league matches to default game ${DEFAULT_GAME_ID}`);
    }

    let tournamentMatchesGameMigrated = 0;
    for (const m of allTournamentMatches) {
      if (!m.gameId) {
        m.gameId = tournamentGameMap.get(m.tournamentId) || DEFAULT_GAME_ID;
        m.updatedAt = now;
        await tournamentMatches.upsert(m);
        tournamentMatchesGameMigrated++;
      }
    }
    if (tournamentMatchesGameMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${tournamentMatchesGameMigrated} tournament matches to default game ${DEFAULT_GAME_ID}`);
    }

    let duelsGameMigrated = 0;
    for (const d of allDuels) {
      if (!d.gameId) {
        d.gameId = DEFAULT_GAME_ID;
        d.updatedAt = now;
        await duels.upsert(d);
        duelsGameMigrated++;
      }
    }
    if (duelsGameMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${duelsGameMigrated} duels to default game ${DEFAULT_GAME_ID}`);
    }

    let rankedMatchesGameMigrated = 0;
    for (const m of allRankedMatches) {
      if (!m.gameId) {
        m.gameId = DEFAULT_GAME_ID;
        m.updatedAt = now;
        await rankedMatches.upsert(m);
        rankedMatchesGameMigrated++;
      }
    }
    if (rankedMatchesGameMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${rankedMatchesGameMigrated} ranked matches to default game ${DEFAULT_GAME_ID}`);
    }

    // 9. Mark migration as applied so it never runs again.
    try {
      await migrations.upsert({
        id: MIGRATION_KEY,
        applied: true,
        appliedAt: new Date().toISOString(),
      });
      console.log('[CommunityMigration] Migration checks complete and marked as applied.');
    } catch (err) {
      console.warn('[CommunityMigration] Could not write migration marker:', err.message);
      console.log('[CommunityMigration] Migration checks complete.');
    }
  } catch (err) {
    console.error('[CommunityMigration] Failed:', err);
  }
}
