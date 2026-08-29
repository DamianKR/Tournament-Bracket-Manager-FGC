import { getCharacter } from '@/data/games';

const SSBU_IMAGE_MAP: Record<string, string> = {
  rosalina: 'rosalina_and_luma.png',
};

export function getCharacterImageUrl(gameId: string | null | undefined, characterId: string | null | undefined): string | null {
  if (!gameId || !characterId || gameId !== 'ssbu') return null;

  const character = getCharacter(gameId, characterId);
  if (!character) return null;

  // Usa BASE_URL para que funcione tanto en local (./) como en GitHub Pages (/repo/)
  const base = (import.meta.env.BASE_URL as string) ?? '/';
  const file = SSBU_IMAGE_MAP[characterId] ?? `${characterId}.png`;
  return `${base}images/characters/ssbu/${file}`;
}
