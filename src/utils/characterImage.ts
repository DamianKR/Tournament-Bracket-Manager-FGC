import { getCharacter } from '@/data/games';

const SSBU_IMAGE_MAP: Record<string, string> = {
  rosalina: 'rosalina_and_luma.png',
};

export function getCharacterImageUrl(gameId: string | null | undefined, characterId: string | null | undefined): string | null {
  if (!gameId || !characterId || gameId !== 'ssbu') return null;

  const character = getCharacter(gameId, characterId);
  if (!character) return null;

  return `/images/characters/ssbu/${SSBU_IMAGE_MAP[characterId] ?? `${characterId}.png`}`;
}
