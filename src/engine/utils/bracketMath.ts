// Mathematical utilities for bracket generation

/**
 * Find the next power of 2 greater than or equal to n
 */
export function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Check if a number is a power of 2
 */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Calculate number of byes needed
 */
export function calculateByes(participantCount: number): number {
  const bracketSize = nextPowerOfTwo(participantCount);
  return bracketSize - participantCount;
}

/**
 * Calculate total rounds in winner bracket
 */
export function calculateWinnerRounds(participantCount: number): number {
  const bracketSize = nextPowerOfTwo(participantCount);
  return Math.log2(bracketSize);
}

/**
 * Calculate total rounds in loser bracket
 * Loser bracket has 2 * (winner rounds - 1) rounds
 */
export function calculateLoserRounds(participantCount: number): number {
  const winnerRounds = calculateWinnerRounds(participantCount);
  return winnerRounds > 1 ? 2 * (winnerRounds - 1) : 0;
}

/**
 * Calculate total number of matches in winner bracket
 */
export function calculateWinnerMatches(participantCount: number): number {
  return participantCount - 1;
}

/**
 * Calculate total number of matches in loser bracket
 */
export function calculateLoserMatches(participantCount: number): number {
  return participantCount - 2; // One less than winner bracket
}

/**
 * Generate match IDs
 */
export function generateMatchId(
  bracketType: 'winner' | 'loser' | 'grand_final',
  round: number,
  matchNumber: number
): string {
  return `${bracketType}-r${round}-m${matchNumber}`;
}
