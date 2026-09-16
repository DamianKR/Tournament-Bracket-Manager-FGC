import { getCharacter } from '@/data/games';
import { getCharacterIconUrl } from '@/utils/characterImage';
import type { ColoredChar } from '@/utils/matchData';
import './CharacterIcons.css';

type CharItem = string | ColoredChar;

interface Props {
  gameId: string | null | undefined;
  /** Character ids, or { id, color } items to show the recorded costume color. */
  characterIds: CharItem[];
  /** Max icons before collapsing into "+N" */
  max?: number;
}

function CharIcon({ gameId, item }: { gameId: string; item: CharItem }) {
  const characterId = typeof item === 'string' ? item : item.id;
  const color = typeof item === 'string' ? undefined : item.color;
  const url = getCharacterIconUrl(gameId, characterId, color);
  const ch = getCharacter(gameId, characterId);
  if (!url) {
    return <span className="ci-fallback" title={ch?.name ?? characterId}>{(ch?.name ?? characterId).slice(0, 1)}</span>;
  }
  return (
    <img
      src={url}
      alt={ch?.name ?? characterId}
      title={ch?.name ?? characterId}
      className="ci-icon"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

export default function CharacterIcons({ gameId, characterIds, max = 4 }: Props) {
  if (!gameId || !characterIds || characterIds.length === 0) return null;
  const shown = characterIds.slice(0, max);
  const extra = characterIds.length - shown.length;
  return (
    <span className={`ci-wrap ${characterIds.length > 1 ? 'ci-wrap--multi' : ''}`}>
      {shown.map((item, i) => {
        const id = typeof item === 'string' ? item : item.id;
        return <CharIcon key={`${id}-${i}`} gameId={gameId} item={item} />;
      })}
      {extra > 0 && <span className="ci-extra">+{extra}</span>}
    </span>
  );
}
