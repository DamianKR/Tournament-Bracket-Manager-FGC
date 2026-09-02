/**
 * League model
 *
 * @typedef {Object} League
 * @property {string} id
 * @property {string} name
 * @property {string} game
 * @property {string} format - 'singles' | 'teams'
 * @property {Array} participants
 * @property {string} status - 'setup' | 'active' | 'completed'
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export function leagueShape(id, name, game, format, communityId = 'community_fgc_santa_clara') {
  return {
    id,
    name,
    game,
    format,
    communityId,
    participants: [],
    status: 'setup',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateLeague(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'] };
  if (typeof obj.id !== 'string' || !obj.id) errors.push('Missing id');
  if (typeof obj.name !== 'string' || !obj.name.trim()) errors.push('Missing name');
  if (!['singles', 'teams'].includes(obj.format)) errors.push('Invalid format');
  if (obj.communityId !== undefined && typeof obj.communityId !== 'string') {
    errors.push('Invalid communityId');
  }
  return { valid: errors.length === 0, errors };
}
