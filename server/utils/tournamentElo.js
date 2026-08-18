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
import { getRankName, getTournamentPoints } from './eloEngine.js';

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
  const allParticipants = await participants.getAll();
  const byId = new Map(allParticipants.map((p) => [p.id, p]));
  const byName = new Map(
    allParticipants.map((p) => [p.name.trim().toLowerCase(), p])
  );

  const applied = [];

  for (const tp of tournament.participants || []) {
    const position = tp.finalPosition;
    if (!position || position > 8) continue;

    const teamMembers = tp.members && Array.isArray(tp.members) ? tp.members : [];

    if (teamMembers.length > 0) {
      // ── Team tournament: distribute points to each member ────────────────
      for (const member of teamMembers) {
        const gp = resolveGlobalParticipant(member, byId, byName);
        if (!gp) continue;

        const ptsBefore = gp.eloPoints ?? 1500;
        const baseEarned = getTournamentPoints(position, ptsBefore);
        if (baseEarned <= 0) continue;

        const earned = Math.round(baseEarned / teamMembers.length);
        if (earned <= 0) continue;

        const ptsAfter = ptsBefore + earned;
        const updated = {
          ...gp,
          eloPoints: ptsAfter,
          eloRank: getRankName(ptsAfter),
          updatedAt: new Date().toISOString(),
        };

        await participants.upsert(updated);

        byId.set(gp.id, updated);
        byName.set(gp.name.trim().toLowerCase(), updated);
        applied.push({
          ...updated,
          _pointsBefore: ptsBefore,
          _pointsEarned: earned,
          _position: position,
          _teamName: tp.name,
        });
      }
    } else {
      // ── Singles tournament: legacy single-participant logic ──────────────
      const gp = resolveGlobalParticipant(tp, byId, byName);
      if (!gp) continue;

      const ptsBefore = gp.eloPoints ?? 1500;
      const earned = getTournamentPoints(position, ptsBefore);
      if (earned <= 0) continue;

      const ptsAfter = ptsBefore + earned;
      const updated = {
        ...gp,
        eloPoints: ptsAfter,
        eloRank: getRankName(ptsAfter),
        updatedAt: new Date().toISOString(),
      };

      await participants.upsert(updated);

      byId.set(gp.id, updated);
      byName.set(gp.name.trim().toLowerCase(), updated);
      applied.push({
        ...updated,
        _pointsBefore: ptsBefore,
        _pointsEarned: earned,
        _position: position,
      });
    }
  }

  return applied;
}
