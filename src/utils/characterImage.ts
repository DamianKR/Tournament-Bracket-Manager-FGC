import { getCharacter, ssbuIcon } from '@/data/games';

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

/** Small icon for podium/thumbnail contexts where size matters. `color` selects the costume variant when available (SSBU: 0-7). */
export function getCharacterIconUrl(gameId: string | null | undefined, characterId: string | null | undefined, color?: number | null): string | null {
  if (!gameId || !characterId) return null;
  const character = getCharacter(gameId, characterId);
  if (!character) return null;
  if (color != null && (character.iconColors ?? 0) > 1 && gameId === 'ssbu') {
    return ssbuIcon(characterId, color);
  }
  return character.imageIconUrl ?? character.imageUrl ?? getLocalPath(gameId, characterId, character.imageFile);
}

/** Whether a character has costume/color icon variants (e.g. SSBU stock icons). */
export function characterHasColorIcons(gameId: string | null | undefined, characterId: string | null | undefined): boolean {
  if (!gameId || !characterId) return false;
  return (getCharacter(gameId, characterId)?.iconColors ?? 0) > 1;
}
