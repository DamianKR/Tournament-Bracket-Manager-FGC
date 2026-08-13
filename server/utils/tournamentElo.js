/**
 * Tournament ELO — awards ranking points for completed tournaments.
 *
 * Applied automatically when a tournament transitions to status='completed'.
 * Only top 8 placements earn points. The tournament is marked eloApplied
 * after processing to prevent double-payouts.
 */

import { participants } from '../db/collections.js';
import { getRankName, getTournamentPoints } from './eloEngine.js';

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

    // Link by globalParticipantId first, then by name (legacy fallback)
    let gp = null;
    if (tp.globalParticipantId) {
      gp = byId.get(tp.globalParticipantId);
    }
    if (!gp) {
      gp = byName.get(tp.name.trim().toLowerCase());
    }
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

    // Keep the maps consistent in case multiple tournament participants
    // resolve to the same global participant (shouldn't happen, but safe)
    byId.set(gp.id, updated);
    byName.set(gp.name.trim().toLowerCase(), updated);
    applied.push({
      ...updated,
      _pointsBefore: ptsBefore,
      _pointsEarned: earned,
      _position: position,
    });
  }

  return applied;
}
