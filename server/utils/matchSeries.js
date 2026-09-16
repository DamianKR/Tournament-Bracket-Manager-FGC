/**
 * Best-of-N series validation for reported match results.
 *
 * A "best of N" series is won by the first player to reach ceil(N/2) game
 * wins. A reported game log is only valid if it represents a completed
 * series: exactly one player reaches the required wins, the series ends
 * on the game where that happens, and no games exist after that point.
 */

export const VALID_SERIES_LENGTHS = [3, 5, 7, 9];

/** Wins needed to take a best-of-N series (Bo3 -> 2, Bo5 -> 3, ...). */
export function requiredWinsFor(gamesPerMatch) {
  const n = Number(gamesPerMatch);
  return Math.ceil((Number.isInteger(n) && n > 0 ? n : 3) / 2);
}

/**
 * Validates a reported series result.
 *
 * @param {Object} opts
 * @param {Array}  [opts.games]            - game log entries ({ winnerId })
 * @param {string} opts.participant1Id     - player that owns the first score number
 * @param {string} opts.participant2Id     - player that owns the second score number
 * @param {string} opts.winnerId           - declared series winner
 * @param {string} [opts.score]            - declared "N-M" score (p1 first)
 * @param {number} [opts.gamesPerMatch]    - series length (3, 5, 7, 9). Default 3.
 * @returns {string|null} error message, or null when the report is valid
 */
export function validateSeriesReport({ games, participant1Id, participant2Id, winnerId, score, gamesPerMatch }) {
  const required = requiredWinsFor(gamesPerMatch);
  const bestOf = required * 2 - 1;

  if (winnerId !== participant1Id && winnerId !== participant2Id) {
    return 'Winner must be one of the participants';
  }

  if (Array.isArray(games) && games.length > 0) {
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (!g || (g.winnerId !== participant1Id && g.winnerId !== participant2Id)) {
        return `Game ${i + 1} has an invalid winner`;
      }
    }

    const wins1 = games.filter(g => g.winnerId === participant1Id).length;
    const wins2 = games.filter(g => g.winnerId === participant2Id).length;
    const winnerWins = winnerId === participant1Id ? wins1 : wins2;
    const loserWins = winnerId === participant1Id ? wins2 : wins1;

    if (winnerWins > required) {
      return `Invalid game log: the winner cannot win more than ${required} games in a Best of ${bestOf}`;
    }
    if (loserWins >= required) {
      return `Invalid game log: both players cannot reach ${required} wins in a Best of ${bestOf}`;
    }
    if (winnerWins < required) {
      return `Incomplete series: the winner must win ${required} games in a Best of ${bestOf} (reported ${wins1}-${wins2})`;
    }

    // The winner must reach the required wins on the LAST game — no games
    // may exist after the series was already decided.
    const winsBeforeLast = games.slice(0, -1).filter(g => g.winnerId === winnerId).length;
    if (winsBeforeLast >= required) {
      return `Invalid game log: the series was already decided before game ${games.length}`;
    }

    if (score) {
      const scoreError = checkScoreMatchesGames(score, wins1, wins2);
      if (scoreError) return scoreError;
    }
    return null;
  }

  // Score-only report (no game log): the score itself must be a valid
  // completed best-of-N result and agree with the declared winner.
  if (score) {
    const parts = String(score).split('-').map(s => s.trim());
    if (parts.length !== 2) return `Invalid score format "${score}" (expected "N-M")`;
    const [s1, s2] = parts.map(Number);
    if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0) {
      return `Invalid score "${score}" (expected non-negative integers "N-M")`;
    }
    if (s1 === s2) return `Score cannot be a tie (${score})`;
    const scoreWinnerId = s1 > s2 ? participant1Id : participant2Id;
    if (scoreWinnerId !== winnerId) {
      return `Score inconsistency: score ${score} indicates Player ${s1 > s2 ? 1 : 2} won, but the selected winner is Player ${winnerId === participant1Id ? 1 : 2}`;
    }
    const winnerScore = Math.max(s1, s2);
    if (winnerScore > required) {
      return `Invalid score: the winner cannot win more than ${required} games in a Best of ${bestOf}`;
    }
    if (winnerScore < required) {
      return `Incomplete series: the winner must win ${required} games in a Best of ${bestOf} (reported ${score})`;
    }
    return null;
  }

  return 'Match result must include a game log or a score';
}

/** Checks that a "N-M" score matches the counted game wins. */
function checkScoreMatchesGames(score, wins1, wins2) {
  const parts = String(score).split('-').map(s => s.trim());
  if (parts.length !== 2) return `Invalid score format "${score}" (expected "N-M")`;
  const [s1, s2] = parts.map(Number);
  if (!Number.isInteger(s1) || !Number.isInteger(s2)) {
    return `Invalid score "${score}" (expected non-negative integers "N-M")`;
  }
  if (s1 !== wins1 || s2 !== wins2) {
    return `Score ${score} does not match the game log (${wins1}-${wins2})`;
  }
  return null;
}
