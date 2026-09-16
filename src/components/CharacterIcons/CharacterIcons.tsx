import { getCharacter } from '@/data/games';
import { getCharacterIconUrl } from '@/utils/characterImage';
import './CharacterIcons.css';

interface Props {
  gameId: string | null | undefined;
  characterIds: string[];
  /** Max icons before collapsing into "+N" */
  max?: number;
}

function CharIcon({ gameId, characterId }: { gameId: string; characterId: string }) {
  const url = getCharacterIconUrl(gameId, characterId);
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
      {shown.map((cid) => <CharIcon key={cid} gameId={gameId} characterId={cid} />)}
      {extra > 0 && <span className="ci-extra">+{extra}</span>}
    </span>
  );
}
