/**
 * Community Migration
 *
 * Fase 1: asegura que existe una comunidad por defecto (FGC Santa Clara)
 * y asigna communityId a todos los users y participants existentes.
 *
 * Corre automáticamente en el startup del servidor.
 */

import { users, participants, communities, tournaments, leagues, duels, duelSettings, tournamentMatches, leagueMatches, rankedMatches } from '../db/collections.js';
import { migrateParticipantGames } from '../utils/participantGames.js';

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';
const DEFAULT_COMMUNITY_NAME = 'FGC Santa Clara';
const DEFAULT_SHORT_NAME = 'FGC SC';

export async function ensureDefaultCommunityAndMigrate() {
  try {
    // 1. Ensure the default community exists only on a true first run.
    // If the user already has other communities in production, do not force the default one.
    const allCommunities = await communities.getAll();
    let community = allCommunities.find(c => c.id === DEFAULT_COMMUNITY_ID);
    if (!community && allCommunities.length === 0) {
      community = {
        id: DEFAULT_COMMUNITY_ID,
        name: DEFAULT_COMMUNITY_NAME,
        shortName: DEFAULT_SHORT_NAME,
        description: 'Comunidad inicial por defecto',
        ownerAdminId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await communities.upsert(community);
      console.log(`[CommunityMigration] Created default community: ${DEFAULT_COMMUNITY_NAME}`);
    }

    // 2. Ensure at least one superadmin exists (promote first admin if needed)
    const allUsers = await users.getAll();
    let superAdmin = allUsers.find(u => u.role === 'superadmin');
    if (!superAdmin) {
      const firstAdmin = allUsers.find(u => u.role === 'admin' || u.role === 'community_admin');
      const candidate = firstAdmin || allUsers[0];
      if (candidate) {
        candidate.role = 'superadmin';
        candidate.communityId = null; // superadmin is not tied to a single community
        candidate.updatedAt = new Date().toISOString();
        await users.upsert(candidate);
        superAdmin = candidate;
        console.log(`[CommunityMigration] Promoted user ${candidate.username} (${candidate.id}) to superadmin`);
      }
    }

    // 3. Assign the default community to all users that don't have one (except superadmin)
    let usersMigrated = 0;
    if (community) {
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

    // 4. Find an owner (superadmin first, then admin/community_admin) and assign to the community if missing
    const owner = superAdmin || allUsers.find(u => u.role === 'admin' || u.role === 'community_admin');
    if (community && owner && (!community.ownerAdminId || community.ownerAdminId !== owner.id)) {
      community.ownerAdminId = owner.id;
      community.updatedAt = new Date().toISOString();
      await communities.upsert(community);
      console.log(`[CommunityMigration] Set community owner: ${owner.username} (${owner.id})`);
    }

    // 5. Assign the default community to all participants that don't have one
    const allParticipants = await participants.getAll();
    let participantsMigrated = 0;
    let participantsEloFixed = 0;
    let participantsGameMigrated = 0;
    for (const participant of allParticipants) {
      const primaryGameProfile = participant.games?.[participant.gameId];
      const needsGameMigration =
        !participant.games ||
        (participant).eloPoints !== undefined ||
        (participant).eloRank !== undefined ||
        (participant.gameId && participant.mainCharacterId && primaryGameProfile?.mainCharacterId == null);
      if (community && !participant.communityId) {
        participant.communityId = DEFAULT_COMMUNITY_ID;
        participant.updatedAt = new Date().toISOString();
        await participants.upsert(participant);
        participantsMigrated++;
      }
      // Fix unranked participants that were incorrectly defaulted to 1500 points
      const migratedP = migrateParticipantGames(participant);
      let fixed = false;
      for (const profile of Object.values(migratedP.games || {})) {
        if (profile.eloRank === 'Sin puntos' && profile.eloPoints !== null) {
          profile.eloPoints = null;
          fixed = true;
        }
      }
      if (fixed || needsGameMigration) {
        migratedP.updatedAt = new Date().toISOString();
        await participants.upsert(migratedP);
        if (fixed) participantsEloFixed++;
        if (needsGameMigration) participantsGameMigrated++;
      }
    }
    if (participantsMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${participantsMigrated} participants to ${DEFAULT_COMMUNITY_NAME}`);
    }
    if (participantsEloFixed > 0) {
      console.log(`[CommunityMigration] Fixed ${participantsEloFixed} unranked participants (eloPoints set to null)`);
    }
    if (participantsGameMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${participantsGameMigrated} participants to per-game profiles`);
    }

    // 6. Assign the default community to existing tournaments, leagues and duels
    const now = new Date().toISOString();

    const allTournaments = await tournaments.getAll();
    let tournamentsMigrated = 0;
    for (const t of allTournaments) {
      if (!t.communityId) {
        t.communityId = DEFAULT_COMMUNITY_ID;
        t.updatedAt = now;
        await tournaments.upsert(t);
        tournamentsMigrated++;
      }
    }
    if (tournamentsMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${tournamentsMigrated} tournaments to ${DEFAULT_COMMUNITY_NAME}`);
    }

    const allLeagues = await leagues.getAll();
    let leaguesMigrated = 0;
    for (const l of allLeagues) {
      if (!l.communityId) {
        l.communityId = DEFAULT_COMMUNITY_ID;
        l.updatedAt = now;
        await leagues.upsert(l);
        leaguesMigrated++;
      }
    }
    if (leaguesMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${leaguesMigrated} leagues to ${DEFAULT_COMMUNITY_NAME}`);
    }

    const allDuels = await duels.getAll();
    let duelsMigrated = 0;
    for (const d of allDuels) {
      if (!d.communityId) {
        d.communityId = DEFAULT_COMMUNITY_ID;
        d.updatedAt = now;
        await duels.upsert(d);
        duelsMigrated++;
      }
    }
    if (duelsMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${duelsMigrated} duels to ${DEFAULT_COMMUNITY_NAME}`);
    }

    // 6b. Assign the default community to duel settings that don't have one
    const allDuelSettings = await duelSettings.getAll();
    let duelSettingsMigrated = 0;
    for (const s of allDuelSettings) {
      if (!s.communityId) {
        s.communityId = DEFAULT_COMMUNITY_ID;
        s.updatedAt = now;
        await duelSettings.upsert(s);
        duelSettingsMigrated++;
      }
    }
    if (duelSettingsMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${duelSettingsMigrated} duel settings to ${DEFAULT_COMMUNITY_NAME}`);
    }

    // 7. Inherit communityId for match records that have a parent id
    const leagueCommunityMap = new Map(allLeagues.map(l => [l.id, l.communityId]));
    const tournamentCommunityMap = new Map(allTournaments.map(t => [t.id, t.communityId]));
    const participantCommunityMap = new Map(allParticipants.map(p => [p.id, p.communityId]));

    const allLeagueMatches = await leagueMatches.getAll();
    let leagueMatchesMigrated = 0;
    for (const m of allLeagueMatches) {
      if (!m.communityId) {
        m.communityId = leagueCommunityMap.get(m.leagueId) || DEFAULT_COMMUNITY_ID;
        m.updatedAt = now;
        await leagueMatches.upsert(m);
        leagueMatchesMigrated++;
      }
    }
    if (leagueMatchesMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${leagueMatchesMigrated} league matches to ${DEFAULT_COMMUNITY_NAME}`);
    }

    const allTournamentMatches = await tournamentMatches.getAll();
    let tournamentMatchesMigrated = 0;
    for (const m of allTournamentMatches) {
      if (!m.communityId) {
        m.communityId = tournamentCommunityMap.get(m.tournamentId) || DEFAULT_COMMUNITY_ID;
        m.updatedAt = now;
        await tournamentMatches.upsert(m);
        tournamentMatchesMigrated++;
      }
    }
    if (tournamentMatchesMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${tournamentMatchesMigrated} tournament matches to ${DEFAULT_COMMUNITY_NAME}`);
    }

    const allRankedMatches = await rankedMatches.getAll();
    let rankedMatchesMigrated = 0;
    for (const m of allRankedMatches) {
      if (!m.communityId) {
        const p1Community = participantCommunityMap.get(m.playerAId);
        const p2Community = participantCommunityMap.get(m.playerBId);
        m.communityId = p1Community || p2Community || DEFAULT_COMMUNITY_ID;
        m.updatedAt = now;
        await rankedMatches.upsert(m);
        rankedMatchesMigrated++;
      }
    }
    if (rankedMatchesMigrated > 0) {
      console.log(`[CommunityMigration] Migrated ${rankedMatchesMigrated} ranked matches to ${DEFAULT_COMMUNITY_NAME}`);
    }

    // 8. Assign default gameId (ssbu) to legacy tournaments, leagues, duels and matches
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

    console.log('[CommunityMigration] Default community and migration checks complete');
  } catch (err) {
    console.error('[CommunityMigration] Failed:', err);
  }
}
