/**
 * GlobalParticipant model — a participant that exists independently of any tournament.
 *
 * This allows reusing players across multiple tournaments without re-entering them.
 * When added to a tournament, a TournamentParticipant entry is created referencing
 * the globalParticipantId.
 *
 * @typedef {Object} GlobalParticipant
 * @property {string}   id          - UUID
 * @property {string}   name        - Display name (unique)
 * @property {string}   [alias]     - Optional short name / gamertag
 * @property {string}   [avatarUrl] - Optional profile image URL
 * @property {Object}   stats       - Aggregate stats across all tournaments
 * @property {number}   stats.tournamentsPlayed
 * @property {number}   stats.wins           - Tournament wins (1st place)
 * @property {number}   stats.matchWins
 * @property {number}   stats.matchLosses
 * @property {string}   createdAt   - ISO 8601
 * @property {string}   updatedAt   - ISO 8601
 */

/**
 * Creates a new GlobalParticipant object.
 * @param {string} id
 * @param {string} name
 * @param {string} [alias]
 * @returns {GlobalParticipant}
 */
export function participantShape(id, name, alias = '') {
  return {
    id,
    name,
    alias,
    avatarUrl: null,
    stats: {
      tournamentsPlayed: 0,
      wins: 0,
      matchWins: 0,
      matchLosses: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validates that an object has the minimum required fields to be stored as a GlobalParticipant.
 * @param {any} obj
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateParticipant(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'] };
  if (typeof obj.id !== 'string' || !obj.id) errors.push('Missing id');
  if (typeof obj.name !== 'string' || !obj.name.trim()) errors.push('Missing name');

  return { valid: errors.length === 0, errors };
}
