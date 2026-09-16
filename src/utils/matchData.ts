import type { MatchGame } from '@/models/types';

/**
 * Collect the ordered unique list of characters a player used across a set,
 * from the per-game log (`games` array). `side` 1 = player1, 2 = player2.
 */
export function charsFromGames(games: MatchGame[] | null | undefined, side: 1 | 2): string[] {
  if (!Array.isArray(games)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of games) {
    const c = side === 1 ? g.player1Character : g.player2Character;
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Parse a "2-1" / "3:0" score string into numeric pair. */
export function parseScoreString(score: string | null | undefined): [number | null, number | null] {
  if (!score || typeof score !== 'string') return [null, null];
  const m = score.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!m) return [null, null];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}
