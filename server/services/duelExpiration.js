/**
 * Duel Expiration Service
 *
 * Handles expiring old duels and applying ELO penalties on the server.
 * This is called by a background interval timer and by the manual /expire endpoint.
 */

import { duels, participants, duelSettings } from '../db/collections.js';
import { duelSettingsShape } from '../models/duel.js';
import { calculateElo, getRankName } from '../utils/eloEngine.js';
import {
  migrateParticipantGames,
  getEffectiveElo,
  setParticipantGameElo,
} from '../utils/participantGames.js';

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
  const gameId = challenge.gameId || 'ssbu';

  challenge.status = 'expired';
  challenge.expiredAt = new Date().toISOString();

  // Apply ELO penalties only if the challenge was accepted
  if (wasAccepted) {
    let challenger = await participants.findById(challenge.challengerId);
    let challenged = await participants.findById(challenge.challengedId);

    if (challenger && challenged) {
      challenger = migrateParticipantGames(challenger);
      challenged = migrateParticipantGames(challenged);

      const challengerReported = !!challenge.challengerResult;
      const challengedReported = !!challenge.challengedResult;

      const isMandatory = challenge.type === 'mandatory';
      const normalPenaltyMultiplier = 2;
      const mandatoryPenaltyMultiplier = 3;

      const challengerElo = getEffectiveElo(challenger, gameId);
      const challengedElo = getEffectiveElo(challenged, gameId);

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
          const challengedPoints = Math.max(0, challengedElo - penalty);
          setParticipantGameElo(challenged, gameId, challengedPoints, getRankName(challengedPoints));

          const { newRA } = calculateElo(challengerElo, challengedElo, 'A');
          setParticipantGameElo(challenger, gameId, newRA, getRankName(newRA));

          await participants.upsert(challenger);
          await participants.upsert(challenged);
        }
      } else {
        // Normal duel: whoever didn't confirm loses double
        if (challengerReported && !challengedReported) {
          const penalty = challengedBaseLoss * normalPenaltyMultiplier;
          const challengedPoints = Math.max(0, challengedElo - penalty);
          setParticipantGameElo(challenged, gameId, challengedPoints, getRankName(challengedPoints));
          await participants.upsert(challenged);
        } else if (!challengerReported && challengedReported) {
          const penalty = challengerBaseLoss * normalPenaltyMultiplier;
          const challengerPoints = Math.max(0, challengerElo - penalty);
          setParticipantGameElo(challenger, gameId, challengerPoints, getRankName(challengerPoints));
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
  const settingsByCommunity = new Map(allSettings.map(s => [s.communityId, s]));
  const getSettings = (communityId) => settingsByCommunity.get(communityId) || duelSettingsShape(communityId);

  const all = await duels.getAll();
  const now = new Date();
  const expiredIds = [];

  for (const challenge of all) {
    const settings = getSettings(challenge.communityId || 'community_fgc_santa_clara');
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
