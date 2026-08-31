/**
 * DuelChallenge model
 *
 * @typedef {Object} DuelChallenge
 * @property {string} id
 * @property {string} challengerId
 * @property {string} challengedId
 * @property {'normal'|'mandatory'} type
 * @property {'pending'|'accepted'|'declined'|'completed'|'expired'|'pending_review'} status
 * @property {string} createdAt
 * @property {string} expiresAt
 * @property {string|null} acceptedAt
 * @property {string|null} declinedAt
 * @property {string|null} completedAt
 * @property {string|null} matchId - ID of the ranked match when completed
 * @property {Object|null} challengerResult - { winnerId: string, reportedAt: string, evidence?: string }
 * @property {Object|null} challengedResult - { winnerId: string, reportedAt: string, evidence?: string }
 * @property {Object|null} metadata
 */

export function duelChallengeShape(id, challengerId, challengedId, expiresAt, type = 'normal') {
  return {
    id,
    challengerId,
    challengedId,
    type,
    status: type === 'mandatory' ? 'accepted' : 'pending',
    createdAt: new Date().toISOString(),
    expiresAt,
    acceptedAt: type === 'mandatory' ? new Date().toISOString() : null,
    declinedAt: null,
    completedAt: null,
    matchId: null,
    challengerResult: null,
    challengedResult: null,
    metadata: null,
  };
}

export function validateDuelChallenge(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'] };
  if (typeof obj.id !== 'string' || !obj.id) errors.push('Missing id');
  if (typeof obj.challengerId !== 'string' || !obj.challengerId) errors.push('Missing challengerId');
  if (typeof obj.challengedId !== 'string' || !obj.challengedId) errors.push('Missing challengedId');
  if (!['pending', 'accepted', 'declined', 'completed', 'expired', 'pending_review'].includes(obj.status)) {
    errors.push('Invalid status');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * DuelSettings model
 *
 * @typedef {Object} DuelSettings
 * @property {number} maxChallengesPerWeek
 * @property {number} eloRestriction
 * @property {number} challengeExpirationDays
 */

export function duelSettingsShape() {
  return {
    maxChallengesPerWeek: 10,
    eloRestriction: 300,
    challengeExpirationDays: 7,
    weeklyResetDay: 1,    // Monday
    weeklyResetHour: 0,   // Midnight
    weeklyResetMinute: 0,
    mandatoryDuelsEnabled: true,
    mandatoryDuelsPerWeek: 1,
  };
}
