/**
 * Modal genérico para reportar/ver detalles de matches
 * Usado en: Torneos, Duelos, Ligas
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import './MatchResultModal.css';

export interface MatchDetailData {
  participant1Name: string;
  participant2Name: string;
  participant1Score?: number;
  participant2Score?: number;
  participant1Characters?: string[];
  participant2Characters?: string[];
  winnerId?: string | null;
}

interface MatchDetailModalProps {
  title?: string;
  participant1Id: string;
  participant2Id: string;
  data: MatchDetailData;
  gameId?: string;
  onConfirm?: (winnerId: string, score1: number, score2: number, chars1?: string[], chars2?: string[]) => void;
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
  const [showChar1Picker, setShowChar1Picker] = useState(false);
  const [showChar2Picker, setShowChar2Picker] = useState(false);

  const game = gameId ? GAMES.find(g => g.id === gameId) : undefined;
  const characters = game?.characters ?? [];

  const winnerId = score1 > score2 ? participant1Id : 
                   score2 > score1 ? participant2Id : null;

  const canSubmit = !hideScores ? (winnerId !== null && (score1 > 0 || score2 > 0)) : true;

  const handleSubmit = () => {
    if (!canSubmit || !onConfirm) return;
    const finalWinnerId = winnerId ?? participant1Id; // Fallback si no hay scores
    onConfirm(
      finalWinnerId, 
      score1, 
      score2, 
      chars1.length > 0 ? chars1 : undefined, 
      chars2.length > 0 ? chars2 : undefined
    );
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
          {/* Participant 1 */}
          <div className={`result-participant ${winnerId === participant1Id ? 'winner' : ''}`}>
            <div className="participant-info">
              <span className="participant-label">{data.participant1Name}</span>
              {chars1.length > 0 && gameId && (
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
              {!readOnly && characters.length > 0 && (
                <button 
                  className="add-character-btn"
                  onClick={() => setShowChar1Picker(true)}
                >
                  <i className="fas fa-plus" /> {t('tournament.matchResult.addCharacter')}
                </button>
              )}
            </div>

            {!hideScores && (
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

          <div className="vs-divider">{t('tournament.matchCard.vs')}</div>

          {/* Participant 2 */}
          <div className={`result-participant ${winnerId === participant2Id ? 'winner' : ''}`}>
            <div className="participant-info">
              <span className="participant-label">{data.participant2Name}</span>
              {chars2.length > 0 && gameId && (
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
              {!readOnly && characters.length > 0 && (
                <button 
                  className="add-character-btn"
                  onClick={() => setShowChar2Picker(true)}
                >
                  <i className="fas fa-plus" /> {t('tournament.matchResult.addCharacter')}
                </button>
              )}
            </div>

            {!hideScores && (
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
            <div className="character-picker-overlay" onClick={() => setShowChar1Picker(false)}>
              <div className="character-picker" onClick={(e) => e.stopPropagation()}>
                <div className="picker-header">
                  <h3>{t('tournament.matchResult.selectCharacters', { player: data.participant1Name })}</h3>
                  <p className="picker-hint">{t('tournament.matchResult.multiSelectHint')}</p>
                </div>
                <div className="character-grid">
                  {characters.map(char => (
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
                <button className="btn-primary mt-2" onClick={() => setShowChar1Picker(false)}>
                  {t('common.done')}
                </button>
              </div>
            </div>
          )}

          {showChar2Picker && characters.length > 0 && gameId && (
            <div className="character-picker-overlay" onClick={() => setShowChar2Picker(false)}>
              <div className="character-picker" onClick={(e) => e.stopPropagation()}>
                <div className="picker-header">
                  <h3>{t('tournament.matchResult.selectCharacters', { player: data.participant2Name })}</h3>
                  <p className="picker-hint">{t('tournament.matchResult.multiSelectHint')}</p>
                </div>
                <div className="character-grid">
                  {characters.map(char => (
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
                <button className="btn-primary mt-2" onClick={() => setShowChar2Picker(false)}>
                  {t('common.done')}
                </button>
              </div>
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
            {!readOnly && onConfirm && (
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
