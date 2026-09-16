import { useTranslation } from 'react-i18next';
import type { MatchGame } from '@/models/rankedMatch';
import { isSeriesComplete, requiredWinsFor } from '@/utils/matchSeries';
import { setSideCharPropagate, setSideColorPropagate, inheritChars } from '@/utils/matchData';
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
  /** Series length (3, 5, 7, 9). When set, extra games can't be added once the series is decided. */
  gamesPerMatch?: number;
}

function GameLogEditor({ games, onChange, playerAId, playerBId, playerAName, playerBName, gameId, characters, gamesPerMatch }: Props) {
  const { t } = useTranslation();

  const seriesDone = gamesPerMatch != null && isSeriesComplete(games, gamesPerMatch);
  const requiredWins = gamesPerMatch != null ? requiredWinsFor(gamesPerMatch) : null;

  const addGame = () => {
    const next = [...games, {
      gameNumber: games.length + 1,
      winnerId: playerAId,
      ...inheritChars(games[games.length - 1]),
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
              onChange={(charId) => onChange(setSideCharPropagate(games, idx, 1, charId))}
              color={g.player1Color ?? 0}
              onColorChange={(color) => onChange(setSideColorPropagate(games, idx, 1, color))}
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
              onChange={(charId) => onChange(setSideCharPropagate(games, idx, 2, charId))}
              color={g.player2Color ?? 0}
              onColorChange={(color) => onChange(setSideColorPropagate(games, idx, 2, color))}
            />
          </div>
        </div>
      ))}
      {requiredWins != null && (
        <p className="game-log-format-hint">
          {t('matchValidation.formatHint', { count: gamesPerMatch, wins: requiredWins })}
        </p>
      )}
      {!seriesDone && (
        <button className="add-game-btn" onClick={addGame}>
          <i className="fas fa-plus" /> {t('tournament.matchResult.addGame')}
        </button>
      )}
      {seriesDone && (
        <p className="game-log-complete-hint">
          {t('matchValidation.seriesComplete')}
        </p>
      )}
    </div>
  );
}

export default GameLogEditor;
