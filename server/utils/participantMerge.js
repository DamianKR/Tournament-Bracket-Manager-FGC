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
 *     1. Para CADA cuenta en user.startggAccounts, busca stubs en CUALQUIER
 *        comunidad con ese startggPlayerId.
 *     2. Para cada stub encontrado: merge (si el user ya tiene participant
 *        en esa comunidad) o adopt (si no tiene).
 *     NO propaga startggPlayerId a los participants reales: la identidad
 *     start.gg vive en el user, no en el participant.
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

  // startggPlayerId: NO se copia al survivor. La identidad start.gg vive en
  // el user (startggAccounts), no en el participant real. Los stubs lo
  // conservan mientras no estén absorbidos.
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

  // Merge game profiles — copy availability metadata from absorbed for games survivor lacks.
  // We deliberately do NOT copy eloPoints/eloRank: ELO is always built from scratch by
  // applyTournamentEloForOne (step 5) so it correctly accumulates on top of whatever ELO
  // the survivor already has from their own activities (ranked matches, etc.).
  for (const [gameId, profile] of Object.entries(absorbed.games ?? {})) {
    if (!survivor.games?.[gameId]) {
      // eslint-disable-next-line no-unused-vars
      const { eloPoints: _ep, eloRank: _er, ...metaOnly } = profile;
      survivor.games = {
        ...(survivor.games ?? {}),
        [gameId]: { ...metaOnly, eloPoints: null, eloRank: 'Sin puntos' },
      };
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
  //
  // Each collection is processed independently. If an individual record fails
  // to persist (network blip, Supabase timeout) it is retried once; if it
  // still fails it is logged and skipped — the merge continues rather than
  // aborting partway through. Failures are collected and reported at the end.

  const rewriteFailures = [];

  /** Try to upsert a record; on error retry once, then log and continue. */
  async function safeUpsert(collection, record, label) {
    try {
      await collection.upsert(record);
    } catch {
      try {
        await new Promise((r) => setTimeout(r, 500));
        await collection.upsert(record);
      } catch (retryErr) {
        const id = record.id ?? '?';
        console.error(`[merge] rewrite failed (${label} ${id}): ${retryErr.message}`);
        rewriteFailures.push({ collection: label, id, error: retryErr.message });
      }
    }
  }

  // tournament_matches
  {
    const all = await tournamentMatches.getAll();
    let n = 0;
    for (const m of all) {
      let dirty = false;
      if (m.player1GlobalId === absorbedId) { m.player1GlobalId = survivorId; dirty = true; }
      if (m.player2GlobalId === absorbedId) { m.player2GlobalId = survivorId; dirty = true; }
      if (m.winnerGlobalId  === absorbedId) { m.winnerGlobalId  = survivorId; dirty = true; }
      if (dirty) { await safeUpsert(tournamentMatches, m, 'tournament_match'); n++; }
    }
    if (n) console.log(`[merge] tournament_matches: ${n} updated`);
  }

  // tournaments → participants[].globalParticipantId + eloUpdates[].id
  // eloUpdates must be rewritten so revertTournamentElo can find the survivor if
  // a tournament is later deleted or re-imported.
  {
    const all = await tournaments.getAll();
    let n = 0;
    for (const t of all) {
      let dirty = false;
      for (const tp of t.participants ?? []) {
        if (tp.globalParticipantId === absorbedId) { tp.globalParticipantId = survivorId; dirty = true; }
      }
      for (const u of t.eloUpdates ?? []) {
        if (u.id === absorbedId) { u.id = survivorId; dirty = true; }
      }
      if (dirty) { await safeUpsert(tournaments, t, 'tournament'); n++; }
    }
    if (n) console.log(`[merge] tournaments: ${n} updated`);
  }

  // ranked_matches
  {
    const all = await rankedMatches.getAll();
    let n = 0;
    for (const m of all) {
      let dirty = false;
      if (m.playerAId === absorbedId) { m.playerAId = survivorId; dirty = true; }
      if (m.playerBId === absorbedId) { m.playerBId = survivorId; dirty = true; }
      if (m.winnerId  === absorbedId) { m.winnerId  = survivorId; dirty = true; }
      if (m.loserId   === absorbedId) { m.loserId   = survivorId; dirty = true; }
      if (dirty) { await safeUpsert(rankedMatches, m, 'ranked_match'); n++; }
    }
    if (n) console.log(`[merge] ranked_matches: ${n} updated`);
  }

  // league_matches
  {
    const all = await leagueMatches.getAll();
    let n = 0;
    for (const m of all) {
      let dirty = false;
      if (m.participant1Id === absorbedId) { m.participant1Id = survivorId; dirty = true; }
      if (m.participant2Id === absorbedId) { m.participant2Id = survivorId; dirty = true; }
      if (m.winnerId       === absorbedId) { m.winnerId       = survivorId; dirty = true; }
      if (dirty) { await safeUpsert(leagueMatches, m, 'league_match'); n++; }
    }
    if (n) console.log(`[merge] league_matches: ${n} updated`);
  }

  // duels
  {
    const all = await duels.getAll();
    let n = 0;
    for (const d of all) {
      let dirty = false;
      if (d.challengerId === absorbedId) { d.challengerId = survivorId; dirty = true; }
      if (d.challengedId === absorbedId) { d.challengedId = survivorId; dirty = true; }
      if (dirty) { await safeUpsert(duels, d, 'duel'); n++; }
    }
    if (n) console.log(`[merge] duels: ${n} updated`);
  }

  // notifications
  {
    const all = await notifications.getAll();
    let n = 0;
    for (const item of all) {
      if (item.recipientId === absorbedId) {
        item.recipientId = survivorId;
        await safeUpsert(notifications, item, 'notification');
        n++;
      }
    }
    if (n) console.log(`[merge] notifications: ${n} updated`);
  }

  // matchmaking_assignments
  {
    const all = await matchmakingAssignments.getAll();
    let n = 0;
    for (const a of all) {
      let dirty = false;
      if (a.player1Id === absorbedId) { a.player1Id = survivorId; dirty = true; }
      if (a.player2Id === absorbedId) { a.player2Id = survivorId; dirty = true; }
      if (a.winnerId  === absorbedId) { a.winnerId  = survivorId; dirty = true; }
      if (dirty) { await safeUpsert(matchmakingAssignments, a, 'matchmaking_assignment'); n++; }
    }
    if (n) console.log(`[merge] matchmaking_assignments: ${n} updated`);
  }

  if (rewriteFailures.length > 0) {
    console.error(`[merge] WARNING: ${rewriteFailures.length} rewrite(s) failed — merge will continue. Check logs above for details.`);
  } else {
    console.log(`[merge] All reference rewrites completed.`);
  }

  // 4. Re-apply ELO for the survivor in tournaments that were exclusively the absorbed
  //    participant's. All other participants already received their ELO when the tournament
  //    was originally completed/imported — do not touch them again.
  //    This runs BEFORE deleting the absorbed so that, if ELO application throws, the
  //    absorbed is still alive and the state remains recoverable.
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

  // 5. Delete absorbed participant — last step so the data stays in a recoverable state
  //    if any earlier step throws.
  await participants.remove(absorbedId);
  console.log(`[merge] Removed absorbed participant ${absorbedId}`);

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
 * Called after a user completes start.gg OAuth (may have multiple accounts).
 *
 * For EACH account in user.startggAccounts:
 *   1. Finds all stubs (any community) with that startggPlayerId.
 *   2. For each stub: merge (user already has participant) or adopt (user has none).
 *
 * Does NOT propagate startggPlayerId to real participants — the identity
 * lives in the user record (startggAccounts), not on the participant.
 *
 * @param {string} userId - The local user ID
 * @returns {Promise<{ propagated: number, merged: number, adopted: number }>}
 */
export async function propagateStartggLink(userId) {
  const user = await users.findById(userId);
  if (!user) return { propagated: 0, merged: 0, adopted: 0 };

  // Collect all playerIds from the accounts array (with legacy fallback)
  const accounts = Array.isArray(user.startggAccounts) && user.startggAccounts.length > 0
    ? user.startggAccounts
    : (user.startggPlayerId ? [{ startggPlayerId: user.startggPlayerId, startggGamerTag: user.startggGamerTag }] : []);
  const playerIds = accounts.map((a) => a.startggPlayerId).filter(Boolean).map(String);

  if (playerIds.length === 0) return { propagated: 0, merged: 0, adopted: 0 };

  let merged = 0, adopted = 0;

  // 1. Find all stubs across ALL communities matching ANY of the user's playerIds
  const allParticipants = await participants.getAll();
  const playerIdSet = new Set(playerIds);
  const matchingStubs = allParticipants.filter(
    (p) => p.isStartggStub && p.startggPlayerId && playerIdSet.has(String(p.startggPlayerId))
  );

  let freshUser = await users.findById(userId);

  for (const stub of matchingStubs) {
    freshUser = await users.findById(userId);
    const existingPid = getParticipantForCommunity(freshUser, stub.communityId);

    if (existingPid && existingPid !== stub.id) {
      await mergeParticipants(existingPid, stub.id);
      merged++;
    } else if (!existingPid) {
      await adoptStub(freshUser, stub);
      adopted++;
    } else if (existingPid === stub.id && stub.isStartggStub) {
      stub.isStartggStub = false;
      stub.updatedAt = now();
      await participants.upsert(stub);
      adopted++;
    }
  }

  // 2. Fallback por nombre: stubs SIN startggPlayerId (entrants sin cuenta
  //    start.gg vinculada). Se unen SOLO en comunidades donde el user ya tiene
  //    participant — nunca adoptamos por nombre solo.
  const gamerTags = accounts
    .map((a) => (a.startggGamerTag ?? '').trim().toLowerCase())
    .filter(Boolean);
  let nameMatched = 0;
  if (gamerTags.length > 0) {
    freshUser = await users.findById(userId);
    const gamerTagSet = new Set(gamerTags);
    const nameCandidates = allParticipants.filter(
      (p) => p.isStartggStub
          && !p.startggPlayerId
          && gamerTagSet.has((p.name ?? '').trim().toLowerCase())
    );
    for (const stub of nameCandidates) {
      freshUser = await users.findById(userId);
      const existingPid = getParticipantForCommunity(freshUser, stub.communityId);
      if (existingPid && existingPid !== stub.id) {
        console.log(`[propagateStartggLink] name-match merge: stub ${stub.id} (${stub.name}) → ${existingPid} en ${stub.communityId}`);
        await mergeParticipants(existingPid, stub.id);
        nameMatched++;
        merged++;
      }
    }
  }

  console.log(`[propagateStartggLink] user=${user.username} playerIds=[${playerIds}] merged=${merged} adopted=${adopted} nameMatched=${nameMatched}`);
  return { propagated: 0, merged, adopted, nameMatched };
}
