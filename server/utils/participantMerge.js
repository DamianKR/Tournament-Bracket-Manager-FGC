/**
 * participantMerge — Gestión de identidad de participantes vinculados a start.gg
 *
 * Tres operaciones principales:
 *
 *   mergeParticipants(survivorId, absorbedId)
 *     Absorbe un participante (generalmente un stub) dentro del survivor.
 *     Reescribe todas las referencias en todas las colecciones.
 *     Re-aplica el ELO de los torneos que pertenecían solo al absorbido.
 *
 *   adoptStub(user, stub)
 *     El user no tenía participant en la comunidad del stub.
 *     Convierte el stub en el participant real del user en esa comunidad.
 *
 *   propagateStartggLink(userId)
 *     Llamar después de que un user complete el OAuth de start.gg.
 *     1. Propaga startggPlayerId al/los participant(s) del user.
 *     2. Busca stubs en CUALQUIER comunidad con ese startggPlayerId.
 *     3. Para cada stub encontrado: merge (si el user ya tiene participant
 *        en esa comunidad) o adopt (si no tiene).
 */

import {
  participants,
  users,
  tournaments,
  tournamentMatches,
  rankedMatches,
  leagueMatches,
  duels,
  notifications,
  matchmakingAssignments,
} from '../db/collections.js';
import { applyTournamentEloForOne } from './tournamentElo.js';
import { migrateParticipantGames } from './participantGames.js';

const now = () => new Date().toISOString();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the participant ID for a user in a specific community,
 * looking both in root participantId and memberships.
 */
function getParticipantForCommunity(user, communityId) {
  if (user.communityId === communityId && user.participantId) return user.participantId;
  const m = (user.memberships ?? []).find(
    (m) => m.communityId === communityId && m.isActive !== false
  );
  return m?.participantId ?? null;
}

/**
 * Returns all participantIds of a user across all communities.
 */
function getAllParticipantIds(user) {
  const ids = new Set();
  if (user.participantId) ids.add(user.participantId);
  for (const m of user.memberships ?? []) {
    if (m.participantId && m.isActive !== false) ids.add(m.participantId);
  }
  return [...ids];
}

// ── mergeParticipants ─────────────────────────────────────────────────────────

/**
 * Merges `absorbedId` into `survivorId`.
 * - Merges identity fields (startggPlayerId, entrantIds, tournamentIds, games).
 * - Rewrites all references in every collection.
 * - Re-applies ELO for tournaments that belonged only to the absorbed participant.
 * - Deletes the absorbed participant.
 *
 * @param {string} survivorId
 * @param {string} absorbedId
 * @returns {Promise<object>} updated survivor
 */
export async function mergeParticipants(survivorId, absorbedId) {
  if (survivorId === absorbedId) return participants.findById(survivorId);

  const [survivor, absorbed] = await Promise.all([
    participants.findById(survivorId),
    participants.findById(absorbedId),
  ]);

  if (!survivor) throw new Error(`mergeParticipants: survivor not found: ${survivorId}`);
  if (!absorbed) throw new Error(`mergeParticipants: absorbed not found: ${absorbedId}`);

  console.log(`[merge] Merging ${absorbed.name} (${absorbedId}) → ${survivor.name} (${survivorId})`);

  // 1. Track which tournament IDs were ONLY in absorbed (for ELO re-application)
  const survivorTournamentIds = new Set(survivor.tournamentIds ?? []);
  const absorbedOnlyTournamentIds = (absorbed.tournamentIds ?? []).filter(
    (id) => !survivorTournamentIds.has(id)
  );

  // 2. Merge identity fields onto survivor
  migrateParticipantGames(survivor);

  survivor.startggPlayerId = survivor.startggPlayerId ?? absorbed.startggPlayerId;
  survivor.startggEntrantIds = [
    ...new Set([
      ...(survivor.startggEntrantIds ?? []),
      ...(absorbed.startggEntrantIds ?? []),
    ]),
  ];
  survivor.tournamentIds = [
    ...new Set([
      ...(survivor.tournamentIds ?? []),
      ...(absorbed.tournamentIds ?? []),
    ]),
  ];

  // Merge game profiles — survivor's ELO wins; copy game profiles that survivor lacks
  for (const [gameId, profile] of Object.entries(absorbed.games ?? {})) {
    if (!survivor.games?.[gameId]) {
      survivor.games = { ...(survivor.games ?? {}), [gameId]: profile };
    }
  }

  // Copy stub metadata if survivor is not already linked
  if (absorbed.isStartggStub && !survivor.isStartggStub) {
    // Keep survivor as the real account — nothing extra needed
  }
  survivor.isStartggStub = false;
  survivor.updatedAt = now();
  await participants.upsert(survivor);

  // 3. Rewrite all references: absorbedId → survivorId

  // tournament_matches
  const allTM = await tournamentMatches.getAll();
  for (const m of allTM) {
    let dirty = false;
    if (m.player1GlobalId === absorbedId) { m.player1GlobalId = survivorId; dirty = true; }
    if (m.player2GlobalId === absorbedId) { m.player2GlobalId = survivorId; dirty = true; }
    if (m.winnerGlobalId  === absorbedId) { m.winnerGlobalId  = survivorId; dirty = true; }
    if (dirty) await tournamentMatches.upsert(m);
  }

  // tournaments → participants[].globalParticipantId
  const allT = await tournaments.getAll();
  for (const t of allT) {
    let dirty = false;
    for (const tp of t.participants ?? []) {
      if (tp.globalParticipantId === absorbedId) {
        tp.globalParticipantId = survivorId;
        dirty = true;
      }
    }
    if (dirty) await tournaments.upsert(t);
  }

  // ranked_matches
  const allRM = await rankedMatches.getAll();
  for (const m of allRM) {
    let dirty = false;
    if (m.playerAId === absorbedId) { m.playerAId = survivorId; dirty = true; }
    if (m.playerBId === absorbedId) { m.playerBId = survivorId; dirty = true; }
    if (m.winnerId  === absorbedId) { m.winnerId  = survivorId; dirty = true; }
    if (m.loserId   === absorbedId) { m.loserId   = survivorId; dirty = true; }
    if (dirty) await rankedMatches.upsert(m);
  }

  // league_matches
  const allLM = await leagueMatches.getAll();
  for (const m of allLM) {
    let dirty = false;
    if (m.participant1Id === absorbedId) { m.participant1Id = survivorId; dirty = true; }
    if (m.participant2Id === absorbedId) { m.participant2Id = survivorId; dirty = true; }
    if (m.winnerId       === absorbedId) { m.winnerId       = survivorId; dirty = true; }
    if (dirty) await leagueMatches.upsert(m);
  }

  // duels
  const allDuels = await duels.getAll();
  for (const d of allDuels) {
    let dirty = false;
    if (d.challengerId  === absorbedId) { d.challengerId  = survivorId; dirty = true; }
    if (d.challengedId  === absorbedId) { d.challengedId  = survivorId; dirty = true; }
    if (dirty) await duels.upsert(d);
  }

  // notifications
  const allN = await notifications.getAll();
  for (const n of allN) {
    if (n.recipientId === absorbedId) {
      n.recipientId = survivorId;
      await notifications.upsert(n);
    }
  }

  // matchmaking_assignments
  const allMA = await matchmakingAssignments.getAll();
  for (const a of allMA) {
    let dirty = false;
    if (a.player1Id === absorbedId) { a.player1Id = survivorId; dirty = true; }
    if (a.player2Id === absorbedId) { a.player2Id = survivorId; dirty = true; }
    if (a.winnerId  === absorbedId) { a.winnerId  = survivorId; dirty = true; }
    if (dirty) await matchmakingAssignments.upsert(a);
  }

  // 4. Delete absorbed participant
  await participants.remove(absorbedId);
  console.log(`[merge] Removed absorbed participant ${absorbedId}`);

  // 5. Re-apply ELO ONLY for the survivor in tournaments that were exclusively
  //    the absorbed participant's. Other participants in those tournaments already
  //    received their ELO when the tournament was originally completed/imported —
  //    we must not touch them again.
  if (absorbedOnlyTournamentIds.length > 0) {
    console.log(`[merge] Re-applying ELO for survivor ${survivorId} across ${absorbedOnlyTournamentIds.length} absorbed tournaments`);
    const allTournaments = await tournaments.getAll();
    const toApply = allTournaments
      .filter(
        (t) =>
          absorbedOnlyTournamentIds.includes(t.id) &&
          t.givesPoints &&
          t.status === 'completed'
      )
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // chronological order matters for ELO

    for (const t of toApply) {
      await applyTournamentEloForOne(t, survivorId);
    }
  }

  // Reload and return updated survivor
  return participants.findById(survivorId);
}

// ── adoptStub ─────────────────────────────────────────────────────────────────

/**
 * The user has no participant in the stub's community.
 * Converts the stub into the user's real participant in that community.
 * Adds a membership for the user in that community.
 *
 * @param {object} user      - Full user record (will be mutated + upserted)
 * @param {object} stub      - The stub participant to adopt
 */
export async function adoptStub(user, stub) {
  console.log(`[merge] User ${user.username} adopting stub ${stub.id} (${stub.name}) in community ${stub.communityId}`);

  // Un-stub the participant
  stub.isStartggStub = false;
  stub.updatedAt = now();
  await participants.upsert(stub);

  // Add membership to user (if not already present)
  if (!Array.isArray(user.memberships)) user.memberships = [];
  const existing = user.memberships.find((m) => m.communityId === stub.communityId);
  if (!existing) {
    user.memberships.push({
      participantId: stub.id,
      communityId:   stub.communityId,
      isActive:      true,
      role:          'user',
      gameAdminFor:  [],
    });
    await users.upsert(user);
    console.log(`[merge] Added membership for user ${user.username} in community ${stub.communityId}`);
  }
}

// ── propagateStartggLink ──────────────────────────────────────────────────────

/**
 * Called after a user completes start.gg OAuth.
 * 1. Writes startggPlayerId to every participant the user owns.
 * 2. Finds all stubs (any community) with that startggPlayerId.
 * 3. For each stub:
 *      - User already has a participant in that community → mergeParticipants
 *      - User has no participant in that community       → adoptStub
 *
 * @param {string} userId - The local user ID
 * @returns {Promise<{ propagated: number, merged: number, adopted: number }>}
 */
export async function propagateStartggLink(userId) {
  const user = await users.findById(userId);
  if (!user || !user.startggPlayerId) return { propagated: 0, merged: 0, adopted: 0 };

  const sggPlayerId = String(user.startggPlayerId);
  let propagated = 0, merged = 0, adopted = 0;

  // 1. Propagate startggPlayerId to user's own participants
  const ownParticipantIds = getAllParticipantIds(user);
  for (const pid of ownParticipantIds) {
    const p = await participants.findById(pid);
    if (p && !p.startggPlayerId) {
      p.startggPlayerId = user.startggPlayerId;
      p.updatedAt = now();
      await participants.upsert(p);
      propagated++;
    }
  }

  // 2. Find all stubs across ALL communities with this startggPlayerId
  const allParticipants = await participants.getAll();
  const matchingStubs = allParticipants.filter(
    (p) => p.isStartggStub && String(p.startggPlayerId) === sggPlayerId
  );

  // Reload user in case adoptStub modified memberships in a previous iteration
  let freshUser = await users.findById(userId);

  for (const stub of matchingStubs) {
    // Reload user each iteration so memberships stay fresh
    freshUser = await users.findById(userId);
    const existingPid = getParticipantForCommunity(freshUser, stub.communityId);

    if (existingPid && existingPid !== stub.id) {
      // User already has a real participant in this community → merge
      await mergeParticipants(existingPid, stub.id);
      merged++;
    } else if (!existingPid) {
      // User has no participant in this community → adopt
      await adoptStub(freshUser, stub);
      adopted++;
    }
    // If existingPid === stub.id the stub is already "their" participant — just un-stub it
    else if (existingPid === stub.id && stub.isStartggStub) {
      stub.isStartggStub = false;
      stub.updatedAt = now();
      await participants.upsert(stub);
      adopted++;
    }
  }

  // 3. Fallback por nombre: stubs SIN startggPlayerId (entrants sin cuenta
  //    start.gg vinculada) jamás podrán matchear por playerId. Los unimos al
  //    participant del user SOLO en comunidades donde el user ya tiene uno —
  //    nunca adoptamos en comunidades extrañas por nombre solo (gamertags
  //    comunes harían merges incorrectos e irreversibles).
  const gamerTag = (user.startggGamerTag ?? '').trim().toLowerCase();
  let nameMatched = 0;
  if (gamerTag) {
    freshUser = await users.findById(userId);
    const nameCandidates = allParticipants.filter(
      (p) => p.isStartggStub
          && !p.startggPlayerId
          && (p.name ?? '').trim().toLowerCase() === gamerTag
    );
    for (const stub of nameCandidates) {
      freshUser = await users.findById(userId);
      const existingPid = getParticipantForCommunity(freshUser, stub.communityId);
      // Solo merge cuando el user ya tiene participant en esa comunidad
      if (existingPid && existingPid !== stub.id) {
        console.log(`[propagateStartggLink] name-match merge: stub ${stub.id} (${stub.name}) → ${existingPid} en ${stub.communityId}`);
        await mergeParticipants(existingPid, stub.id);
        nameMatched++;
        merged++;
      }
    }
  }

  console.log(`[propagateStartggLink] user=${user.username} propagated=${propagated} merged=${merged} adopted=${adopted} nameMatched=${nameMatched}`);
  return { propagated, merged, adopted, nameMatched };
}
