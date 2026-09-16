/**
 * Best-of-N series validation for reported match results (client side).
 *
 * Mirrors server/utils/matchSeries.js — a "best of N" series is won by the
 * first player to reach ceil(N/2) game wins, and the game log must end on
 * the game where that happens.
 */

import type { MatchGame } from '@/models/rankedMatch';

/** Wins needed to take a best-of-N series (Bo3 -> 2, Bo5 -> 3, ...). */
export function requiredWinsFor(gamesPerMatch?: number): number {
  const n = typeof gamesPerMatch === 'number' && Number.isInteger(gamesPerMatch) && gamesPerMatch > 0
    ? gamesPerMatch
    : 3;
  return Math.ceil(n / 2);
}

export type SeriesValidationError =
  | { code: 'empty' }
  | { code: 'invalidWinner'; game: number }
  | { code: 'incomplete'; required: number; bestOf: number; score: string }
  | { code: 'tooManyWins'; required: number; bestOf: number }
  | { code: 'trailingGame'; game: number; required: number };

/**
 * Validates a game log against a best-of-N format.
 * Returns a structured error (usable with i18n) or null when valid.
 */
export function validateSeriesGames(
  games: MatchGame[],
  player1Id: string,
  player2Id: string,
  gamesPerMatch?: number
): SeriesValidationError | null {
  const required = requiredWinsFor(gamesPerMatch);
  const bestOf = required * 2 - 1;

  if (!games.length) return { code: 'empty' };

  for (let i = 0; i < games.length; i++) {
    const w = games[i]?.winnerId;
    if (w !== player1Id && w !== player2Id) {
      return { code: 'invalidWinner', game: i + 1 };
    }
  }

  const wins1 = games.filter(g => g.winnerId === player1Id).length;
  const wins2 = games.filter(g => g.winnerId === player2Id).length;
  const winnerWins = Math.max(wins1, wins2);
  const loserWins = Math.min(wins1, wins2);

  if (loserWins >= required) {
    return { code: 'tooManyWins', required, bestOf };
  }
  if (winnerWins > required) {
    return { code: 'tooManyWins', required, bestOf };
  }
  if (winnerWins < required) {
    return { code: 'incomplete', required, bestOf, score: `${wins1}-${wins2}` };
  }

  const seriesWinnerId = wins1 > wins2 ? player1Id : player2Id;
  const winsBeforeLast = games.slice(0, -1).filter(g => g.winnerId === seriesWinnerId).length;
  if (winsBeforeLast >= required) {
    return { code: 'trailingGame', game: games.length, required };
  }

  return null;
}

/** True once the series is decided: someone reached the required wins or all games were played. */
export function isSeriesComplete(games: MatchGame[], gamesPerMatch?: number): boolean {
  const required = requiredWinsFor(gamesPerMatch);
  const bestOf = required * 2 - 1;
  if (games.length >= bestOf) return true;
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.winnerId, (counts.get(g.winnerId) ?? 0) + 1);
  for (const wins of counts.values()) {
    if (wins >= required) return true;
  }
  return false;
}
