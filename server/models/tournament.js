/**
 * Tournament model — documents the shape of a Tournament object stored in tournaments.json
 *
 * @typedef {'setup' | 'in_progress' | 'completed'} TournamentStatus
 * @typedef {'single_elimination' | 'double_elimination'} TournamentMode
 * @typedef {'winner' | 'loser' | 'grand_final'} BracketType
 * @typedef {'pending' | 'in_progress' | 'completed'} MatchStatus
 *
 * @typedef {Object} TournamentParticipant
 * @property {string}  id            - UUID
 * @property {string}  name          - Display name
 * @property {number}  seed          - Position in bracket (1-based)
 * @property {boolean} eliminated    - Whether out of the tournament
 * @property {number}  lossCount     - 0, 1, or 2 (double elimination)
 * @property {number}  [finalPosition] - Final ranking (1 = champion)
 *
 * @typedef {Object} Match
 * @property {string}       id
 * @property {number}       roundNumber
 * @property {number}       matchNumber
 * @property {BracketType}  bracketType
 * @property {string|null}  participant1Id
 * @property {string|null}  participant2Id
 * @property {string|null}  winnerId
 * @property {string|null}  loserId
 * @property {MatchStatus}  status
 * @property {string|null}  nextWinnerMatchId
 * @property {string|null}  nextLoserMatchId
 *
 * @typedef {Object} Bracket
 * @property {Match[]}   winnerBracket
 * @property {Match[]}   loserBracket
 * @property {Match|null} grandFinal
 * @property {Match|null} grandFinalReset
 *
 * @typedef {Object} Tournament
 * @property {string}           id
 * @property {string}           name
 * @property {TournamentMode}   mode
 * @property {TournamentStatus} status
 * @property {TournamentParticipant[]} participants
 * @property {Bracket|null}     bracket
 * @property {string|null}      championId
 * @property {string}           createdAt  - ISO 8601
 * @property {string}           updatedAt  - ISO 8601
 */

/**
 * Creates a new empty Tournament object (without bracket).
 * Used as documentation reference — actual creation happens in the frontend engine.
 *
 * @param {string} id
 * @param {string} name
 * @param {TournamentMode} mode
 * @returns {Tournament}
 */
export function tournamentShape(id, name, mode) {
  return {
    id,
    name,
    mode,
    status: 'setup',
    participants: [],
    bracket: null,
    championId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validates that an object has the minimum required fields to be stored as a Tournament.
 * @param {any} obj
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTournament(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object') return { valid: false, errors: ['Not an object'] };
  if (typeof obj.id !== 'string' || !obj.id) errors.push('Missing id');
  if (typeof obj.name !== 'string' || !obj.name) errors.push('Missing name');
  if (!['setup', 'in_progress', 'completed'].includes(obj.status)) errors.push('Invalid status');
  if (!['single_elimination', 'double_elimination'].includes(obj.mode)) errors.push('Invalid mode');
  if (!Array.isArray(obj.participants)) errors.push('participants must be an array');

  return { valid: errors.length === 0, errors };
}
