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

export interface ColoredChar {
  id: string;
  color?: number;
}

/**
 * Same as charsFromGames but keeps a costume color per character
 * (from player1Color/player2Color on each game). When the same character
 * appears with multiple colors, the most frequently used wins.
 */
export function charsWithColorsFromGames(games: MatchGame[] | null | undefined, side: 1 | 2): ColoredChar[] {
  if (!Array.isArray(games)) return [];
  const order = new Map<string, number>();
  const colorCounts = new Map<string, Map<number, number>>();
  for (const g of games) {
    const c = side === 1 ? g.player1Character : g.player2Character;
    const color = (side === 1 ? g.player1Color : g.player2Color) ?? 0;
    if (!c) continue;
    if (!order.has(c)) {
      order.set(c, order.size);
      colorCounts.set(c, new Map());
    }
    const counts = colorCounts.get(c)!;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return [...order.keys()].map((id) => {
    const counts = colorCounts.get(id)!;
    let best: number | undefined;
    let bestN = -1;
    for (const [color, n] of counts) {
      if (n > bestN) { bestN = n; best = color; }
    }
    return { id, color: best };
  });
}

/**
 * Apply a character pick for `side` at `idx` and fill every other EMPTY slot
 * on that side with the same char+color (the "same main all set" convenience).
 * Slots that already have a character are left untouched.
 */
export function setSideCharPropagate(
  games: MatchGame[],
  idx: number,
  side: 1 | 2,
  charId: string | null
): MatchGame[] {
  const charKey = side === 1 ? 'player1Character' : 'player2Character';
  const colorKey = side === 1 ? 'player1Color' : 'player2Color';
  const color = games[idx]?.[colorKey] ?? 0;
  return games.map((g, i) => {
    if (i === idx) return { ...g, [charKey]: charId ?? undefined };
    if (charId && !g[charKey]) return { ...g, [charKey]: charId, [colorKey]: color };
    return g;
  });
}

/**
 * Apply a color pick for `side` at `idx` and propagate it to other games where
 * the side uses the same character and still has the previous (inherited)
 * color, so deliberate skin changes elsewhere are preserved.
 */
export function setSideColorPropagate(
  games: MatchGame[],
  idx: number,
  side: 1 | 2,
  color: number
): MatchGame[] {
  const charKey = side === 1 ? 'player1Character' : 'player2Character';
  const colorKey = side === 1 ? 'player1Color' : 'player2Color';
  const charId = games[idx]?.[charKey];
  const prevColor = games[idx]?.[colorKey] ?? 0;
  return games.map((g, i) => {
    if (i === idx) return { ...g, [colorKey]: color };
    if (g[charKey] === charId && (g[colorKey] == null || g[colorKey] === prevColor)) {
      return { ...g, [colorKey]: color };
    }
    return g;
  });
}

/** Fields a new game inherits from the previous one (same mains carry over). */
export function inheritChars(last: MatchGame | undefined): Partial<MatchGame> {
  if (!last) return {};
  return {
    player1Character: last.player1Character,
    player1Color: last.player1Color,
    player2Character: last.player2Character,
    player2Color: last.player2Color,
  };
}

/** Parse a "2-1" / "3:0" score string into numeric pair. */
export function parseScoreString(score: string | null | undefined): [number | null, number | null] {
  if (!score || typeof score !== 'string') return [null, null];
  const m = score.match(/(\d+)\s*[-–:]\s*(\d+)/);
  if (!m) return [null, null];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}
