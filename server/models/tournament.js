/**
 * Tournament model — documents the shape of a Tournament object stored in tournaments.json
 *
 * @typedef {'setup' | 'in_progress' | 'completed'} TournamentStatus
 * @typedef {'single_elimination' | 'double_elimination'} TournamentMode
 * @typedef {'singles' | 'teams'} TournamentType
 * @typedef {'winner' | 'loser' | 'grand_final'} BracketType
 * @typedef {'pending' | 'in_progress' | 'completed'} MatchStatus
 * @typedef {2 | 3 | 4 | 5} TeamSize
 *
 * @typedef {Object} TeamMember
 * @property {string} [globalParticipantId] - Links to a GlobalParticipant
 * @property {string} name                  - Player name
 * @property {string} [alias]               - Player alias/gamertag
 *
 * @typedef {Object} TournamentParticipant
 * @property {string}  id            - UUID
 * @property {string}  name          - Player name (singles) or Team name (teams)
 * @property {string}  [alias]       - Player alias (singles) or Team tag (teams)
 * @property {number}  seed          - Position in bracket (1-based)
 * @property {boolean} eliminated    - Whether out of the tournament
 * @property {number}  lossCount     - 0, 1, or 2 (double elimination)
 * @property {number}  [finalPosition] - Final ranking (1 = champion)
 * @property {string}  [globalParticipantId] - Links to GlobalParticipant (singles only)
 * @property {TeamMember[]} [members] - Team members (teams only)
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
 * @property {TournamentMode}   mode        - single_elimination | double_elimination
 * @property {TournamentType}   type        - singles | teams
 * @property {TournamentStatus} status
 * @property {string|null}      [gameId]    - Game identifier (e.g., 'ssbu')
 * @property {TeamSize}         [teamSize]  - Only for team tournaments: 2, 3, 4, or 5
 * @property {boolean}          [givesPoints] - Whether this tournament awards ranking/ELO points
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
 * @param {TournamentType} type
 * @param {TeamSize} [teamSize]
 * @returns {Tournament}
 */
export function tournamentShape(id, name, mode, type = 'singles', teamSize) {
  const tournament = {
    id,
    name,
    mode,
    type,
    status: 'setup',
    gameId: null,
    givesPoints: true,
    participants: [],
    bracket: null,
    championId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Only add teamSize for team tournaments
  if (type === 'teams' && teamSize) {
    tournament.teamSize = teamSize;
  }
  
  return tournament;
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
  
  // type is optional for backward compatibility (defaults to 'singles')
  if (obj.type !== undefined && !['singles', 'teams'].includes(obj.type)) {
    errors.push('Invalid type (must be singles or teams)');
  }
  
  // teamSize is only valid for team tournaments
  if (obj.teamSize !== undefined && ![2, 3, 4, 5].includes(obj.teamSize)) {
    errors.push('Invalid teamSize (must be 2-5 for team tournaments)');
  }

  return { valid: errors.length === 0, errors };
}
