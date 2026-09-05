import { getCharacter } from '@/data/games';

const SSBU_IMAGE_MAP: Record<string, string> = {
  rosalina: 'rosalina_and_luma.png',
};

function getLocalPath(gameId: string, characterId: string, imageFile?: string): string | null {
  const base = (import.meta.env.BASE_URL as string) ?? '/';
  if (imageFile) return `${base}images/characters/${gameId}/${imageFile}`;
  if (gameId === 'ssbu') {
    const file = SSBU_IMAGE_MAP[characterId] ?? `${characterId}.png`;
    return `${base}images/characters/ssbu/${file}`;
  }
  return null;
}

/** Large render for profile pages and similar. */
export function getCharacterImageUrl(gameId: string | null | undefined, characterId: string | null | undefined): string | null {
  if (!gameId || !characterId) return null;
  const character = getCharacter(gameId, characterId);
  if (!character) return null;
  return character.imageUrl ?? getLocalPath(gameId, characterId, character.imageFile);
}

/** Small icon for podium/thumbnail contexts where size matters. */
export function getCharacterIconUrl(gameId: string | null | undefined, characterId: string | null | undefined): string | null {
  if (!gameId || !characterId) return null;
  const character = getCharacter(gameId, characterId);
  if (!character) return null;
  return character.imageIconUrl ?? character.imageUrl ?? getLocalPath(gameId, characterId, character.imageFile);
}
