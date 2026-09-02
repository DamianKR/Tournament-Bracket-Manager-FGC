/**
 * RankedMatch model
 *
 * @typedef {Object} RankedMatch
 * @property {string} id
 * @property {'duel'|'matchmaking'} matchType
 * @property {string} playerAId
 * @property {string} playerBId
 * @property {string} winnerId
 * @property {Object|null} score
 * @property {number} playerAEloBefore
 * @property {number} playerBEloBefore
 * @property {number} playerAEloAfter
 * @property {number} playerBEloAfter
 * @property {number} playerAEloChange
 * @property {number} playerBEloChange
 * @property {string} createdAt
 * @property {Object|null} metadata
 */

export function rankedMatchShape(id, matchType, playerAId, playerBId, winnerId, eloData, communityId) {
  return {
    id,
    matchType,
    playerAId,
    playerBId,
    winnerId,
    communityId: communityId || null,
    score: null,
    playerAEloBefore: eloData.playerAEloBefore,
    playerBEloBefore: eloData.playerBEloBefore,
    playerAEloAfter: eloData.playerAEloAfter,
    playerBEloAfter: eloData.playerBEloAfter,
    playerAEloChange: eloData.playerAEloChange,
    playerBEloChange: eloData.playerBEloChange,
    createdAt: new Date().toISOString(),
    metadata: null,
  };
}

export function validateRankedMatch(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'] };
  if (typeof obj.id !== 'string' || !obj.id) errors.push('Missing id');
  if (!['duel', 'matchmaking'].includes(obj.matchType)) errors.push('Invalid matchType');
  if (typeof obj.playerAId !== 'string' || !obj.playerAId) errors.push('Missing playerAId');
  if (typeof obj.playerBId !== 'string' || !obj.playerBId) errors.push('Missing playerBId');
  if (typeof obj.winnerId !== 'string' || !obj.winnerId) errors.push('Missing winnerId');
  if (obj.communityId !== undefined && obj.communityId !== null && typeof obj.communityId !== 'string') {
    errors.push('Invalid communityId');
  }
  return { valid: errors.length === 0, errors };
}
