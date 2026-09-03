import { useTranslation } from 'react-i18next';
import { GAMES, getGame } from '@/data/games';
import './CharacterSelect.css';

interface Props {
  gameId: string | null;
  characterId: string | null;
  onGameChange: (gameId: string | null) => void;
  onCharacterChange: (characterId: string | null) => void;
}

function CharacterSelect({ gameId, characterId, onGameChange, onCharacterChange }: Props) {
  const { t } = useTranslation();
  const selectedGame = gameId ? getGame(gameId) : null;

  function handleGameChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value || null;
    onGameChange(val);
    onCharacterChange(null); // reset character when game changes
  }

  function handleCharacterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onCharacterChange(e.target.value || null);
  }

  return (
    <div className="character-select">
      <div className="form-group">
        <label>{t('common.game')}</label>
        <select value={gameId ?? ''} onChange={handleGameChange}>
          <option value="">{t('common.noGame')}</option>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {selectedGame && (
        <div className="form-group">
          <label>{t('common.mainCharacter')}</label>
          <select value={characterId ?? ''} onChange={handleCharacterChange}>
            <option value="">{t('common.noMain')}</option>
            {selectedGame.characters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default CharacterSelect;
