/**
 * Duel Expiration Service
 *
 * Handles expiring old duels and applying ELO penalties on the server.
 * This is called by a background interval timer and by the manual /expire endpoint.
 */

import { duels, participants, duelSettings } from '../db/collections.js';
import { calculateElo, getRankName } from '../utils/eloEngine.js';

/**
 * Expire a single duel by ID and apply ELO penalties if accepted.
 * @param {string} id
 * @returns {Promise<DuelChallenge|null>}
 */
export async function expireDuel(id) {
  const challenge = await duels.findById(id);
  if (!challenge) return null;
  if (challenge.status !== 'pending' && challenge.status !== 'accepted') {
    return challenge;
  }

  const wasAccepted = challenge.status === 'accepted';

  challenge.status = 'expired';
  challenge.expiredAt = new Date().toISOString();

  // Apply ELO penalties only if the challenge was accepted
  if (wasAccepted) {
    const challenger = await participants.findById(challenge.challengerId);
    const challenged = await participants.findById(challenge.challengedId);

    if (challenger && challenged) {
      const challengerReported = !!challenge.challengerResult;
      const challengedReported = !!challenge.challengedResult;

      const isMandatory = challenge.type === 'mandatory';
      const normalPenaltyMultiplier = 2;
      const mandatoryPenaltyMultiplier = 3;

      const challengerElo = challenger.eloPoints ?? 1500;
      const challengedElo = challenged.eloPoints ?? 1500;

      // If challenger wins: A wins, B (challenged) loses
      const { newRB: challengedAfterLosingToChallenger } = calculateElo(challengerElo, challengedElo, 'A');
      const challengedBaseLoss = Math.max(0, challengedElo - challengedAfterLosingToChallenger);

      // If challenged wins: B wins, A (challenger) loses
      const { newRA: challengerAfterLosingToChallenged } = calculateElo(challengerElo, challengedElo, 'B');
      const challengerBaseLoss = Math.max(0, challengerElo - challengerAfterLosingToChallenged);

      if (isMandatory) {
        // Mandatory duel: challenged didn't confirm → loses triple, challenger gains normally
        if (challengerReported && !challengedReported) {
          const penalty = challengedBaseLoss * mandatoryPenaltyMultiplier;
          challenged.eloPoints = Math.max(0, challengedElo - penalty);
          challenged.eloRank = getRankName(challenged.eloPoints);

          const { newRA } = calculateElo(challengerElo, challengedElo, 'A');
          challenger.eloPoints = newRA;
          challenger.eloRank = getRankName(challenger.eloPoints);

          await participants.upsert(challenger);
          await participants.upsert(challenged);
        }
      } else {
        // Normal duel: whoever didn't confirm loses double
        if (challengerReported && !challengedReported) {
          const penalty = challengedBaseLoss * normalPenaltyMultiplier;
          challenged.eloPoints = Math.max(0, challengedElo - penalty);
          challenged.eloRank = getRankName(challenged.eloPoints);
          await participants.upsert(challenged);
        } else if (!challengerReported && challengedReported) {
          const penalty = challengerBaseLoss * normalPenaltyMultiplier;
          challenger.eloPoints = Math.max(0, challengerElo - penalty);
          challenger.eloRank = getRankName(challenger.eloPoints);
          await participants.upsert(challenger);
        }
        // If both reported or neither reported, no penalty
      }
    }
  }

  await duels.upsert(challenge);
  return challenge;
}

/**
 * Find and expire all old duels.
 * Called by the server cron/interval.
 * @returns {Promise<number>} number of expired duels
 */
export async function expireAllOldDuels() {
  const allSettings = await duelSettings.getAll();
  const settings = allSettings.find(s => s.id === 'default') || {
    challengeExpirationDays: 7,
  };

  const all = await duels.getAll();
  const now = new Date();
  const expiredIds = [];

  for (const challenge of all) {
    let shouldExpire = false;

    if (challenge.status === 'pending' && new Date(challenge.expiresAt) < now) {
      shouldExpire = true;
    }

    if (challenge.status === 'accepted' && challenge.acceptedAt) {
      const acceptedExpiresAt = new Date(challenge.acceptedAt);
      acceptedExpiresAt.setDate(acceptedExpiresAt.getDate() + settings.challengeExpirationDays);
      if (acceptedExpiresAt < now) {
        shouldExpire = true;
      }
    }

    if (shouldExpire) {
      expiredIds.push(challenge.id);
    }
  }

  for (const id of expiredIds) {
    try {
      await expireDuel(id);
    } catch (err) {
      console.error(`[DuelExpiration] Failed to expire ${id}:`, err);
    }
  }

  return expiredIds.length;
}
