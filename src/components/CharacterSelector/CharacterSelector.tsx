/**
 * Selector inline de personajes para duelos/matches
 */
import { GAMES } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import './CharacterSelector.css';

interface CharacterSelectorProps {
  gameId: string;
  selectedCharacters: string[];
  onToggle: (characterId: string) => void;
}

function CharacterSelector({ gameId, selectedCharacters, onToggle }: CharacterSelectorProps) {
  const game = GAMES.find(g => g.id === gameId);
  const characters = game?.characters ?? [];

  if (characters.length === 0) {
    return null;
  }

  return (
    <div className="character-selector">
      {characters.map(char => {
        const isSelected = selectedCharacters.includes(char.id);
        return (
          <button
            key={char.id}
            type="button"
            className={`char-btn ${isSelected ? 'selected' : ''}`}
            onClick={() => onToggle(char.id)}
            title={char.name}
          >
            <img
              src={getCharacterImageUrl(gameId, char.id) ?? ''}
              alt={char.name}
              className="char-img"
            />
            {isSelected && (
              <div className="char-check">
                <i className="fas fa-check" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default CharacterSelector;
