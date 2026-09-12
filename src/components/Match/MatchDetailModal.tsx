/**
 * Modal genérico para reportar/ver detalles de matches
 * Usado en: Torneos, Duelos, Ligas
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import type { MatchGame } from '@/models/rankedMatch';
import CharacterDropdown from '@/components/CharacterDropdown/CharacterDropdown';
import './MatchResultModal.css';

export interface MatchDetailData {
  participant1Name: string;
  participant2Name: string;
  participant1Score?: number;
  participant2Score?: number;
  participant1Characters?: string[];
  participant2Characters?: string[];
  games?: MatchGame[];
  winnerId?: string | null;
}

interface MatchDetailModalProps {
  title?: string;
  participant1Id: string;
  participant2Id: string;
  data: MatchDetailData;
  gameId?: string;
  onConfirm?: (winnerId: string, score1: number, score2: number, chars1?: string[], chars2?: string[]) => void;
  onConfirmGames?: (winnerId: string, games: MatchGame[]) => void;
  onCancel: () => void;
  onRevert?: () => void;
  readOnly?: boolean;
  hideScores?: boolean; // Para casos donde no se usan scores
}

function MatchDetailModal({
  title,
  participant1Id,
  participant2Id,
  data,
  gameId,
  onConfirm,
  onConfirmGames,
  onCancel,
  onRevert,
  readOnly = false,
  hideScores = false,
}: MatchDetailModalProps) {
  const { t } = useTranslation();
  
  const [score1, setScore1] = useState(data.participant1Score ?? 0);
  const [score2, setScore2] = useState(data.participant2Score ?? 0);
  const [chars1, setChars1] = useState<string[]>(data.participant1Characters ?? []);
  const [chars2, setChars2] = useState<string[]>(data.participant2Characters ?? []);
  const [games, setGames] = useState<MatchGame[]>(data.games ?? []);
  const [showChar1Picker, setShowChar1Picker] = useState(false);
  const [showChar2Picker, setShowChar2Picker] = useState(false);
  const [charFilter1, setCharFilter1] = useState('');
  const [charFilter2, setCharFilter2] = useState('');

  const useGameLog = !!onConfirmGames;
  const game = gameId ? GAMES.find(g => g.id === gameId) : undefined;
  const characters = game?.characters ?? [];

  const winnerId = useGameLog
    ? (score1 > score2 ? participant1Id : score2 > score1 ? participant2Id : null)
    : (score1 > score2 ? participant1Id : score2 > score1 ? participant2Id : null);

  const canSubmit = useGameLog
    ? (winnerId !== null && games.length > 0)
    : (!hideScores ? (winnerId !== null && (score1 > 0 || score2 > 0)) : true);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const finalWinnerId = winnerId ?? participant1Id;
    if (useGameLog && onConfirmGames) {
      onConfirmGames(finalWinnerId, games);
      return;
    }
    if (onConfirm) {
      onConfirm(
        finalWinnerId,
        score1,
        score2,
        chars1.length > 0 ? chars1 : undefined,
        chars2.length > 0 ? chars2 : undefined
      );
    }
  };

  const handleScoreChange = (player: 1 | 2, value: string) => {
    const num = Math.max(0, Math.min(99, parseInt(value) || 0));
    if (player === 1) setScore1(num);
    else setScore2(num);
  };

  const incrementScore = (player: 1 | 2) => {
    if (player === 1) setScore1(s => Math.min(99, s + 1));
    else setScore2(s => Math.min(99, s + 1));
  };

  const decrementScore = (player: 1 | 2) => {
    if (player === 1) setScore1(s => Math.max(0, s - 1));
    else setScore2(s => Math.max(0, s - 1));
  };

  const addGame = () => {
    setGames(prev => [
      ...prev,
      { gameNumber: prev.length + 1, winnerId: participant1Id, player1Character: undefined, player2Character: undefined },
    ]);
  };

  const recalcScores = (next: MatchGame[]) => {
    setScore1(next.filter(g => g.winnerId === participant1Id).length);
    setScore2(next.filter(g => g.winnerId === participant2Id).length);
  };

  const removeGame = (idx: number) => {
    setGames(prev => {
      const next = prev.filter((_, i) => i !== idx).map((g, i) => ({ ...g, gameNumber: i + 1 }));
      recalcScores(next);
      return next;
    });
  };

  const updateGame = (idx: number, patch: Partial<MatchGame>) => {
    setGames(prev => {
      const next = prev.map((g, i) => i === idx ? { ...g, ...patch } : g);
      recalcScores(next);
      return next;
    });
  };

  const toggleCharacter = (player: 1 | 2, charId: string) => {
    if (player === 1) {
      setChars1(prev => 
        prev.includes(charId) 
          ? prev.filter(id => id !== charId)
          : [...prev, charId]
      );
    } else {
      setChars2(prev => 
        prev.includes(charId) 
          ? prev.filter(id => id !== charId)
          : [...prev, charId]
      );
    }
  };

  const removeCharacter = (player: 1 | 2, charId: string) => {
    if (player === 1) {
      setChars1(prev => prev.filter(id => id !== charId));
    } else {
      setChars2(prev => prev.filter(id => id !== charId));
    }
  };

  const getCharacterName = (charId: string) => {
    return characters.find(c => c.id === charId)?.name ?? '';
  };

  const openChar1Picker = () => { setCharFilter1(''); setShowChar1Picker(true); };
  const closeChar1Picker = () => { setShowChar1Picker(false); setCharFilter1(''); };
  const openChar2Picker = () => { setCharFilter2(''); setShowChar2Picker(true); };
  const closeChar2Picker = () => { setShowChar2Picker(false); setCharFilter2(''); };

  const modalTitle = title ?? (readOnly ? t('tournament.matchResult.viewTitle') : t('tournament.matchResult.title'));

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="match-result-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{modalTitle}</h2>
          <button className="modal-close" onClick={onCancel}>
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className="modal-body">
          {/* Matchup header */}
          {!useGameLog && !hideScores && (
            <div className="game-log-score-display">
              <span className="score-pill">{score1} - {score2}</span>
            </div>
          )}

          {useGameLog && (
            <div className="matchup-header">
              <span className={`matchup-player matchup-p1 ${winnerId === participant1Id ? 'winner' : ''}`}>{data.participant1Name}</span>
              <span className="matchup-score">{score1} - {score2}</span>
              <span className={`matchup-player matchup-p2 ${winnerId === participant2Id ? 'winner' : ''}`}>{data.participant2Name}</span>
            </div>
          )}

          {/* Participant 1 */}
          <div className={`result-participant ${winnerId === participant1Id ? 'winner' : ''} ${useGameLog ? 'hidden' : ''}`}>
            <div className="participant-info">
              <span className="participant-label">{data.participant1Name}</span>
              {chars1.length > 0 && gameId && !useGameLog && (
                <div className="character-badges">
                  {chars1.map((charId, idx) => (
                    <div key={idx} className="character-badge">
                      <img 
                        src={getCharacterImageUrl(gameId, charId) ?? ''} 
                        alt={getCharacterName(charId)}
                        className="character-icon"
                      />
                      <span className="character-name">{getCharacterName(charId)}</span>
                      {!readOnly && (
                        <button 
                          className="remove-char-btn"
                          onClick={() => removeCharacter(1, charId)}
                          title={t('common.remove')}
                        >
                          <i className="fas fa-xmark" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && characters.length > 0 && !useGameLog && (
                <button 
                  className="add-character-btn"
                  onClick={openChar1Picker}
                >
                  <i className="fas fa-plus" /> {t('tournament.matchResult.addCharacter')}
                </button>
              )}
            </div>

            {!hideScores && !useGameLog && (
              <div className="score-controls">
                {!readOnly && (
                  <button 
                    className="score-btn decrement"
                    onClick={() => decrementScore(1)}
                    disabled={score1 === 0}
                  >
                    <i className="fas fa-minus" />
                  </button>
                )}
                <input
                  type="number"
                  className="score-input"
                  value={score1}
                  onChange={(e) => handleScoreChange(1, e.target.value)}
                  min="0"
                  max="99"
                  readOnly={readOnly}
                />
                {!readOnly && (
                  <button 
                    className="score-btn increment"
                    onClick={() => incrementScore(1)}
                    disabled={score1 === 99}
                  >
                    <i className="fas fa-plus" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={`vs-divider ${useGameLog ? 'hidden' : ''}`}>{t('tournament.matchCard.vs')}</div>

          {/* Participant 2 */}
          <div className={`result-participant ${winnerId === participant2Id ? 'winner' : ''} ${useGameLog ? 'hidden' : ''}`}>
            <div className="participant-info">
              <span className="participant-label">{data.participant2Name}</span>
              {chars2.length > 0 && gameId && !useGameLog && (
                <div className="character-badges">
                  {chars2.map((charId, idx) => (
                    <div key={idx} className="character-badge">
                      <img 
                        src={getCharacterImageUrl(gameId, charId) ?? ''} 
                        alt={getCharacterName(charId)}
                        className="character-icon"
                      />
                      <span className="character-name">{getCharacterName(charId)}</span>
                      {!readOnly && (
                        <button 
                          className="remove-char-btn"
                          onClick={() => removeCharacter(2, charId)}
                          title={t('common.remove')}
                        >
                          <i className="fas fa-xmark" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && characters.length > 0 && !useGameLog && (
                <button 
                  className="add-character-btn"
                  onClick={openChar2Picker}
                >
                  <i className="fas fa-plus" /> {t('tournament.matchResult.addCharacter')}
                </button>
              )}
            </div>

            {!hideScores && !useGameLog && (
              <div className="score-controls">
                {!readOnly && (
                  <button 
                    className="score-btn decrement"
                    onClick={() => decrementScore(2)}
                    disabled={score2 === 0}
                  >
                    <i className="fas fa-minus" />
                  </button>
                )}
                <input
                  type="number"
                  className="score-input"
                  value={score2}
                  onChange={(e) => handleScoreChange(2, e.target.value)}
                  min="0"
                  max="99"
                  readOnly={readOnly}
                />
                {!readOnly && (
                  <button 
                    className="score-btn increment"
                    onClick={() => incrementScore(2)}
                    disabled={score2 === 99}
                  >
                    <i className="fas fa-plus" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Character Pickers */}
          {showChar1Picker && characters.length > 0 && gameId && (
            <div className="character-picker-overlay" onClick={closeChar1Picker}>
              <div className="character-picker" onClick={(e) => e.stopPropagation()}>
                <div className="picker-header">
                  <h3>{t('tournament.matchResult.selectCharacters', { player: data.participant1Name })}</h3>
                  <button className="picker-done-btn" onClick={closeChar1Picker}>
                    {t('common.done')}
                  </button>
                </div>
                <div className="picker-search">
                  <i className="fas fa-search picker-search-icon" />
                  <input
                    type="text"
                    className="picker-search-input"
                    placeholder={t('tournament.create.characterSearch', { defaultValue: 'Search character...' })}
                    value={charFilter1}
                    onChange={(e) => setCharFilter1(e.target.value)}
                  />
                </div>
                <div className="character-grid">
                  {characters
                    .filter(char => char.name.toLowerCase().includes(charFilter1.toLowerCase()))
                    .map(char => (
                      <div
                        key={char.id}
                        className={`character-option ${chars1.includes(char.id) ? 'selected' : ''}`}
                        onClick={() => toggleCharacter(1, char.id)}
                      >
                        <img 
                          src={getCharacterImageUrl(gameId, char.id) ?? ''} 
                          alt={char.name}
                          className="character-option-img"
                        />
                        <span className="character-option-name">{char.name}</span>
                        {chars1.includes(char.id) && (
                          <div className="selected-indicator">
                            <i className="fas fa-check" />
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {showChar2Picker && characters.length > 0 && gameId && (
            <div className="character-picker-overlay" onClick={closeChar2Picker}>
              <div className="character-picker" onClick={(e) => e.stopPropagation()}>
                <div className="picker-header">
                  <h3>{t('tournament.matchResult.selectCharacters', { player: data.participant2Name })}</h3>
                  <button className="picker-done-btn" onClick={closeChar2Picker}>
                    {t('common.done')}
                  </button>
                </div>
                <div className="picker-search">
                  <i className="fas fa-search picker-search-icon" />
                  <input
                    type="text"
                    className="picker-search-input"
                    placeholder={t('tournament.create.characterSearch', { defaultValue: 'Search character...' })}
                    value={charFilter2}
                    onChange={(e) => setCharFilter2(e.target.value)}
                  />
                </div>
                <div className="character-grid">
                  {characters
                    .filter(char => char.name.toLowerCase().includes(charFilter2.toLowerCase()))
                    .map(char => (
                      <div
                        key={char.id}
                        className={`character-option ${chars2.includes(char.id) ? 'selected' : ''}`}
                        onClick={() => toggleCharacter(2, char.id)}
                      >
                        <img 
                          src={getCharacterImageUrl(gameId, char.id) ?? ''} 
                          alt={char.name}
                          className="character-option-img"
                        />
                        <span className="character-option-name">{char.name}</span>
                        {chars2.includes(char.id) && (
                          <div className="selected-indicator">
                            <i className="fas fa-check" />
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Game Log */}
          {useGameLog && !readOnly && (
            <div className="game-log-section">
              <h4>{t('tournament.matchResult.gameLog')}</h4>
              {games.map((g, idx) => (
                <div key={idx} className="game-log-row">
                  {gameId && characters.length > 0 && (
                    <div className="game-log-char game-log-p1">
                      <CharacterDropdown
                        gameId={gameId}
                        characters={characters}
                        value={g.player1Character ?? null}
                        onChange={(charId) => updateGame(idx, { player1Character: charId ?? undefined })}
                      />
                    </div>
                  )}

                  <div className="game-log-center">
                    <span className="game-log-number">{t('tournament.matchResult.game')} {g.gameNumber}</span>
                    <select
                      className="game-log-select game-log-winner-select"
                      value={g.winnerId}
                      onChange={(e) => updateGame(idx, { winnerId: e.target.value })}
                    >
                      <option value={participant1Id}>{data.participant1Name}</option>
                      <option value={participant2Id}>{data.participant2Name}</option>
                    </select>
                    <button className="remove-game-btn" onClick={() => removeGame(idx)} title={t('common.remove')}>
                      <i className="fas fa-trash" />
                    </button>
                  </div>

                  {gameId && characters.length > 0 && (
                    <div className="game-log-char game-log-p2">
                      <CharacterDropdown
                        gameId={gameId}
                        characters={characters}
                        value={g.player2Character ?? null}
                        onChange={(charId) => updateGame(idx, { player2Character: charId ?? undefined })}
                      />
                    </div>
                  )}
                </div>
              ))}
              <button className="add-game-btn" onClick={addGame}>
                <i className="fas fa-plus" /> {t('tournament.matchResult.addGame')}
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {onRevert && readOnly && (
            <button className="btn-danger revert-match-btn" onClick={onRevert}>
              <i className="fas fa-rotate-left" /> {t('tournament.matchResult.revert')}
            </button>
          )}
          <div className="footer-actions">
            <button className="btn-outline" onClick={onCancel}>
              {readOnly ? t('common.close') : t('common.cancel')}
            </button>
            {!readOnly && (onConfirm || onConfirmGames) && (
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                <i className="fas fa-check" /> {t('tournament.matchResult.confirm')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MatchDetailModal;
