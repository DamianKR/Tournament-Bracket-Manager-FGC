import { useTranslation } from 'react-i18next';
import type { MatchGame } from '@/models/rankedMatch';
import CharacterDropdown from '@/components/CharacterDropdown/CharacterDropdown';
import type { Character } from '@/data/games';
import './GameLogEditor.css';

interface Props {
  games: MatchGame[];
  onChange: (games: MatchGame[]) => void;
  playerAId: string;
  playerBId: string;
  playerAName: string;
  playerBName: string;
  gameId: string;
  characters: Character[];
}

function GameLogEditor({ games, onChange, playerAId, playerBId, playerAName, playerBName, gameId, characters }: Props) {
  const { t } = useTranslation();

  const addGame = () => {
    const next = [...games, {
      gameNumber: games.length + 1,
      winnerId: playerAId,
    }];
    onChange(next);
  };

  const removeGame = (idx: number) => {
    const next = games.filter((_, i) => i !== idx).map((g, i) => ({ ...g, gameNumber: i + 1 }));
    onChange(next);
  };

  const updateGame = (idx: number, updates: Partial<MatchGame>) => {
    const next = [...games];
    next[idx] = { ...next[idx], ...updates };
    onChange(next);
  };

  return (
    <div className="game-log-editor">
      {games.map((g, idx) => (
        <div key={idx} className="game-log-row">
          <div className="game-log-char">
            <CharacterDropdown
              gameId={gameId}
              characters={characters}
              value={g.player1Character ?? null}
              onChange={(charId) => updateGame(idx, { player1Character: charId ?? undefined })}
            />
          </div>

          <div className="game-log-center">
            <span className="game-log-number">{t('tournament.matchResult.game')} {g.gameNumber}</span>
            <select
              className="game-log-select game-log-winner-select"
              value={g.winnerId}
              onChange={(e) => updateGame(idx, { winnerId: e.target.value })}
            >
              <option value={playerAId}>{playerAName}</option>
              <option value={playerBId}>{playerBName}</option>
            </select>
            <button className="remove-game-btn" onClick={() => removeGame(idx)} title={t('common.remove')}>
              <i className="fas fa-trash" />
            </button>
          </div>

          <div className="game-log-char game-log-p2">
            <CharacterDropdown
              gameId={gameId}
              characters={characters}
              value={g.player2Character ?? null}
              onChange={(charId) => updateGame(idx, { player2Character: charId ?? undefined })}
            />
          </div>
        </div>
      ))}
      <button className="add-game-btn" onClick={addGame}>
        <i className="fas fa-plus" /> {t('tournament.matchResult.addGame')}
      </button>
    </div>
  );
}

export default GameLogEditor;
