import type { CSSProperties } from 'react';
import { getGame } from '@/data/games';

/** Color de marca del juego (Game.color). undefined si no existe. */
export function gameAccent(gameId: string | null | undefined): string | undefined {
  return gameId ? getGame(gameId)?.color : undefined;
}

/** Estilo para badges/chips de juego: texto, borde y fondo tenue del color de marca. */
export function gameBadgeStyle(gameId: string | null | undefined): CSSProperties | undefined {
  const c = gameAccent(gameId);
  return c ? { color: c, borderColor: `${c}59`, background: `${c}1a` } : undefined;
}
