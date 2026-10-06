/**
 * Tournament ELO — awards ranking points for completed tournaments.
 *
 * Applied automatically when a tournament transitions to status='completed'.
 * Only top 8 placements earn points. The tournament is marked eloApplied
 * after processing to prevent double-payouts.
 *
 * For team tournaments, each team member receives points based on their own
 * ELO and K-factor, divided by the number of members in the team.
 */

import { participants } from '../db/collections.js';
import { getRankName, getTournamentPoints, effectiveElo } from './eloEngine.js';
import {
  migrateParticipantGames,
  getEffectiveElo as getParticipantEffectiveElo,
  setParticipantGameElo,
} from './participantGames.js';

/**
 * Resolve a tournament participant or team member to a global participant.
 *
 * @param {object} entity
 * @param {Map<string, object>} byId
 * @param {Map<string, object>} byName
 * @returns {object|null}
 */
function resolveGlobalParticipant(entity, byId, byName) {
  let gp = null;
  if (entity.globalParticipantId) {
    gp = byId.get(entity.globalParticipantId);
  }
  if (!gp && entity.name) {
    gp = byName.get(entity.name.trim().toLowerCase());
  }
  return gp;
}

/**
 * Awards ELO points for top-8 placements in a tournament.
 * Returns the list of updated participants (does NOT persist the tournament).
 *
 * @param {object} tournament
 * @returns {Promise<Array<object>>} updated participants
 */
export async function applyTournamentElo(tournament) {
  const allParticipants = (await participants.getAll()).map(migrateParticipantGames);
  const byId = new Map(allParticipants.map((p) => [p.id, p]));
  // Scope name-fallback to the tournament's community — without this, a name
  // collision across communities can award points to the wrong participant.
  const byName = new Map(
    allParticipants
      .filter((p) => !tournament.communityId || p.communityId === tournament.communityId)
      .map((p) => [p.name.trim().toLowerCase(), p])
  );

  const applied = [];
  const gameId = tournament.gameId || 'ssbu';
  // Payout depth is configured per tournament (8/16/32); default top 8.
  const pointsDepth = [8, 16, 32].includes(tournament.pointsDepth) ? tournament.pointsDepth : 8;

  for (const tp of tournament.participants || []) {
    const position = tp.finalPosition;
    if (!position || position > pointsDepth) continue;

    const teamMembers = tp.members && Array.isArray(tp.members) ? tp.members : [];

    if (teamMembers.length > 0) {
      // ── Team tournament: distribute points to each member ────────────────
      for (const member of teamMembers) {
        const gp = resolveGlobalParticipant(member, byId, byName);
        // Exclude name-only imports (no startggPlayerId) — no account to follow up with.
        // Stubs WITH a startggPlayerId are real recurring players (just not linked yet).
        if (!gp || (gp.isStartggStub && !gp.startggPlayerId)) continue;

        const ptsBefore = getParticipantEffectiveElo(gp, gameId);
        const baseEarned = getTournamentPoints(position, ptsBefore, pointsDepth);
        if (baseEarned <= 0) continue;

        const earned = Math.round(baseEarned / teamMembers.length);
        if (earned <= 0) continue;

        const ptsAfter = ptsBefore + earned;
        setParticipantGameElo(gp, gameId, ptsAfter, getRankName(ptsAfter));

        await participants.upsert(gp);

        byId.set(gp.id, gp);
        byName.set(gp.name.trim().toLowerCase(), gp);
        applied.push({
          ...gp,
          _pointsBefore: ptsBefore,
          _pointsEarned: earned,
          _position: position,
          _teamName: tp.name,
        });
      }
    } else {
      // ── Singles tournament ───────────────────────────────────────────────
      const gp = resolveGlobalParticipant(tp, byId, byName);
      // Exclude name-only imports (isStartggStub && no startggPlayerId) — no account
      // to follow up with. Stubs WITH a startggPlayerId are real Start.gg players
      // (just haven't linked a local account yet) and should earn ELO normally.
      if (!gp || (gp.isStartggStub && !gp.startggPlayerId)) continue;

      const ptsBefore = getParticipantEffectiveElo(gp, gameId);
      const earned = getTournamentPoints(position, ptsBefore, pointsDepth);
      if (earned <= 0) continue;

      const ptsAfter = ptsBefore + earned;
      setParticipantGameElo(gp, gameId, ptsAfter, getRankName(ptsAfter));

      await participants.upsert(gp);

      byId.set(gp.id, gp);
      byName.set(gp.name.trim().toLowerCase(), gp);
      applied.push({
        ...gp,
        _pointsBefore: ptsBefore,
        _pointsEarned: earned,
        _position: position,
      });
    }
  }

  return applied;
}

/**
 * Reverts the ELO payout stored in `tournament.eloUpdates`.
 *
 * Used when (a) re-importing a tournament that already paid out, so the fresh
 * calculation doesn't stack on top of the old one, and (b) deleting a
 * completed tournament to undo its ranking effect.
 *
 * Each stored update carries the participant's global id + _pointsEarned, so
 * the revert subtracts exactly what was awarded. Participants that no longer
 * exist (merged/deleted) are skipped with a warning.
 *
 * @param {object} tournament - the PREVIOUS tournament record (with eloUpdates)
 * @returns {Promise<Array>} list of reverted entries
 */
export async function revertTournamentElo(tournament) {
  const updates = Array.isArray(tournament?.eloUpdates) ? tournament.eloUpdates : [];
  if (updates.length === 0) return [];

  const gameId = tournament.gameId || 'ssbu';
  const reverted = [];

  for (const u of updates) {
    const p = await participants.findById(u.id);
    if (!p) {
      console.warn(`[eloRevert] participant ${u.id} (${u.name}) not found — skipping`);
      continue;
    }
    migrateParticipantGames(p);
    const cur     = getParticipantEffectiveElo(p, gameId);
    const earned  = u._pointsEarned ?? 0;
    const ptsAfter = Math.max(0, cur - earned);
    setParticipantGameElo(p, gameId, ptsAfter, getRankName(ptsAfter));
    p.updatedAt = new Date().toISOString();
    await participants.upsert(p);
    reverted.push({ id: u.id, name: u.name, reverted: earned, before: cur, after: ptsAfter });
    console.log(`[eloRevert] ${p.name} | ${cur} → ${ptsAfter} (-${earned})`);
  }

  return reverted;
}

/**
 * Awards ELO to ONE specific participant for their placement in a tournament.
 *
 * Used during participant merges so only the merged participant gets the ELO
 * delta — all other participants in the tournament already received their ELO
 * when the tournament was originally completed/imported.
 *
 * @param {object} tournament
 * @param {string} participantId - global participant ID of the survivor
 * @returns {Promise<object|null>} result object or null if no points awarded
 */
export async function applyTournamentEloForOne(tournament, participantId) {
  const p = await participants.findById(participantId);
  // Name-only imports (no startggPlayerId) can't receive ELO — no account to
  // follow up with. This is called after a merge/claim so isStartggStub should
  // already be false, but guard just in case.
  if (!p || (p.isStartggStub && !p.startggPlayerId)) return null;

  migrateParticipantGames(p);

  const gameId     = tournament.gameId || 'ssbu';
  const pointsDepth = [8, 16, 32].includes(tournament.pointsDepth) ? tournament.pointsDepth : 8;

  // Find this participant's tournament entry
  const tp = (tournament.participants ?? []).find(
    (entry) => entry.globalParticipantId === participantId
  );
  if (!tp) return null;

  const position = tp.finalPosition;
  if (!position || position > pointsDepth) return null;

  const teamMembers = Array.isArray(tp.members) ? tp.members : [];

  let earned;
  const ptsBefore = getParticipantEffectiveElo(p, gameId);

  if (teamMembers.length > 0) {
    const base = getTournamentPoints(position, ptsBefore, pointsDepth);
    earned = Math.round(base / teamMembers.length);
  } else {
    earned = getTournamentPoints(position, ptsBefore, pointsDepth);
  }

  if (earned <= 0) return null;

  const ptsAfter = ptsBefore + earned;
  setParticipantGameElo(p, gameId, ptsAfter, getRankName(ptsAfter));
  p.updatedAt = new Date().toISOString();
  await participants.upsert(p);

  console.log(`[eloForOne] ${p.name} | tournament=${tournament.id} | pos=${position} | ${ptsBefore} → ${ptsAfter} (+${earned})`);
  return { participantId, pointsBefore: ptsBefore, pointsEarned: earned, pointsAfter: ptsAfter };
}
