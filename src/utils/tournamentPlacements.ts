/**
 * Calcula el placement estándar de torneo según la posición en el ranking.
 *
 * `mode` puede ser 'single' o 'double' y usa la misma fórmula
 * que `assignFinalPositions` en `src/engine/progression/matchProgression.ts`.
 *
 * Single elimination: 1, 2, 4, 4, 8, 8, 8, 8, 16...
 * Double elimination: 1, 2, 3, 4, 5, 5, 7, 7, 9, 9, 9, 9, 13...
 */
export function getTournamentPlacement(
  position: number,
  mode: 'single' | 'double' = 'double'
): number {
  if (position <= 0) return position;
  if (position === 1) return 1;

  if (mode === 'single') {
    // Misma fórmula que single elimination en assignFinalPositions
    return Math.pow(2, Math.ceil(Math.log2(position)));
  }

  // Double elimination: start = 3, groupSize = 1; cada dos grupos se duplica
  if (position === 2) return 2;

  let start = 3;
  let groupSize = 1;
  let covered = 0;
  let groupIndex = 0;
  const internal = position - 3;

  while (covered + groupSize <= internal) {
    covered += groupSize;
    start += groupSize;
    groupIndex += 1;
    if (groupIndex % 2 === 0) {
      groupSize *= 2;
    }
  }

  return start;
}

/**
 * Calcula los placements para una lista ordenada de participantes.
 * La lista debe estar ordenada del mejor (índice 0) al peor.
 */
export function calculatePlacements<T>(
  orderedItems: T[],
  getId: (item: T) => string,
  getName: (item: T) => string,
  mode: 'single' | 'double' = 'double'
): Array<{ id: string; name: string; placement: number }> {
  return orderedItems.map((item, index) => ({
    id: getId(item),
    name: getName(item),
    placement: getTournamentPlacement(index + 1, mode),
  }));
}
