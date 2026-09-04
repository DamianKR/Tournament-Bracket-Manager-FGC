/**
 * GlobalParticipant model
 *
 * Stats are NOT stored here — they are computed at runtime by reading
 * the tournaments array. Only the FK list (tournamentIds) is persisted.
 * ELO and main character are stored per game in `games`.
 *
 * @typedef {Object} GlobalParticipant
 * @property {string}   id
 * @property {string}   name          - Display name (unique)
 * @property {string}   alias         - Optional gamertag
 * @property {string|null} avatarUrl
 * @property {string[]} tournamentIds - IDs of tournaments this player joined
 * @property {string|null} gameId     - Primary/default game id
 * @property {string|null} mainCharacterId - Main character in primary game
 * @property {Object.<string, ParticipantGameProfile>} games - Per-game profiles
 * @property {string}   createdAt
 * @property {string}   updatedAt
 */

export function participantShape(id, name, alias = '', communityId = 'community_fgc_santa_clara') {
  return {
    id,
    name,
    alias,
    avatarUrl: null,
    tournamentIds: [],
    communityId,
    gameId: null,
    mainCharacterId: null,
    games: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateParticipant(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'] };
  if (typeof obj.id !== 'string' || !obj.id) errors.push('Missing id');
  if (typeof obj.name !== 'string' || !obj.name.trim()) errors.push('Missing name');
  if (obj.communityId !== undefined && typeof obj.communityId !== 'string') {
    errors.push('Invalid communityId');
  }
  return { valid: errors.length === 0, errors };
}
