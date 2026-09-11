/**
 * Componente para ingresar posiciones finales manualmente
 * El usuario ordena a los participantes del 1er al último lugar.
 * El placement se calcula automáticamente en formato de torneo.
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import { getTournamentPlacement } from '@/utils/tournamentPlacements';
import './ManualStandingsInput.css';

interface ParticipantPlacement {
  id: string;
  name: string;
  placement: number;
  characters?: string[];
}

interface ManualStandingsInputProps {
  participants: any[];
  gameId: string;
  manualMode?: 'single' | 'double';
  onFinish: (placements: ParticipantPlacement[]) => void;
  onCancel: () => void;
  finishing?: boolean;
}

function ManualStandingsInput({
  participants,
  gameId,
  manualMode = 'double',
  onFinish,
  onCancel,
  finishing = false,
}: ManualStandingsInputProps) {
  const { t } = useTranslation();

  // Lista ordenada del 1er al último
  const [orderedParticipants, setOrderedParticipants] = useState<any[]>([...participants]);
  const [characters, setCharacters] = useState<Map<string, string[]>>(new Map());
  const [showCharPicker, setShowCharPicker] = useState<string | null>(null);
  const [charFilter, setCharFilter] = useState('');

  const game = GAMES.find(g => g.id === gameId);
  const gameCharacters = game?.characters ?? [];

  // Calcula los placements según el orden y el modo manual
  const placements = useMemo<ParticipantPlacement[]>(() => {
    return orderedParticipants.map((p, index) => ({
      id: p.id,
      name: p.name,
      placement: getTournamentPlacement(index + 1, manualMode),
      characters: characters.get(p.id),
    }));
  }, [orderedParticipants, characters, manualMode]);

  const moveParticipant = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= orderedParticipants.length) return;
    const newOrder = [...orderedParticipants];
    const [removed] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, removed);
    setOrderedParticipants(newOrder);
  };

  const openCharPicker = (participantId: string) => {
    setCharFilter('');
    setShowCharPicker(participantId);
  };

  const closeCharPicker = () => {
    setShowCharPicker(null);
    setCharFilter('');
  };

  const toggleCharacter = (participantId: string, charId: string) => {
    setCharacters(prev => {
      const next = new Map(prev);
      const current = next.get(participantId) ?? [];
      if (current.includes(charId)) {
        next.set(participantId, current.filter(id => id !== charId));
      } else {
        next.set(participantId, [...current, charId]);
      }
      return next;
    });
  };

  const removeCharacter = (participantId: string, charId: string) => {
    setCharacters(prev => {
      const next = new Map(prev);
      const current = next.get(participantId) ?? [];
      next.set(participantId, current.filter(id => id !== charId));
      return next;
    });
  };

  const getCharacterName = (charId: string) => {
    return gameCharacters.find(c => c.id === charId)?.name ?? '';
  };

  const handleFinish = () => {
    onFinish(placements);
  };

  if (participants.length === 0) {
    return (
      <div className="manual-standings-empty">
        <p>{t('tournament.create.manualNoParticipants')}</p>
        <button className="btn-outline" onClick={onCancel}>
          {t('common.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="manual-standings-container">
      <div className="manual-standings-header">
        <h3>{t('tournament.create.manualModeTitle')}</h3>
        <p className="manual-standings-desc">{t('tournament.create.manualModeDesc')}</p>
      </div>

      <div className="manual-standings-list">
        {orderedParticipants.map((participant, index) => {
          const participantChars = characters.get(participant.id) ?? [];
          const placement = getTournamentPlacement(index + 1);

          return (
            <div key={participant.id} className="manual-standing-row">
              <div className="manual-standing-rank">
                <span className="placement-number">{placement}</span>
                <span className="ordinal-position">{index + 1}</span>
              </div>

              <div className="manual-standing-info">
                <span className="participant-name">{participant.name}</span>

                {participantChars.length > 0 && (
                  <div className="character-badges-inline">
                    {participantChars.map((charId, idx) => (
                      <div key={idx} className="character-badge-small">
                        <img
                          src={getCharacterImageUrl(gameId, charId) ?? ''}
                          alt={getCharacterName(charId)}
                          className="character-icon-small"
                        />
                        <button
                          className="remove-char-btn-small"
                          onClick={() => removeCharacter(participant.id, charId)}
                          title={t('common.remove')}
                        >
                          <i className="fas fa-xmark" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {gameCharacters.length > 0 && (
                  <button
                    className="add-character-btn-small"
                    onClick={() => openCharPicker(participant.id)}
                  >
                    <i className="fas fa-plus" /> {t('tournament.matchResult.addCharacter')}
                  </button>
                )}
              </div>

              <div className="manual-standing-controls">
                <button
                  className="control-btn"
                  onClick={() => moveParticipant(index, index - 1)}
                  disabled={index === 0}
                  title={t('common.moveUp')}
                >
                  <i className="fas fa-chevron-up" />
                </button>
                <button
                  className="control-btn"
                  onClick={() => moveParticipant(index, index + 1)}
                  disabled={index === orderedParticipants.length - 1}
                  title={t('common.moveDown')}
                >
                  <i className="fas fa-chevron-down" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Character Picker */}
      {showCharPicker && gameCharacters.length > 0 && (
        <div className="character-picker-overlay" onClick={closeCharPicker}>
          <div className="character-picker" onClick={(e) => e.stopPropagation()}>
            <div className="picker-header">
              <div className="picker-title">
                <h3>{t('tournament.create.manualCharacters')}</h3>
                <p className="picker-hint">{t('tournament.matchResult.multiSelectHint')}</p>
              </div>
              <button
                className="picker-done-btn"
                onClick={closeCharPicker}
              >
                {t('common.done')}
              </button>
            </div>
            <div className="picker-search">
              <i className="fas fa-search picker-search-icon" />
              <input
                type="text"
                className="picker-search-input"
                placeholder={t('tournament.create.characterSearch', { defaultValue: 'Search character...' })}
                value={charFilter}
                onChange={(e) => setCharFilter(e.target.value)}
              />
            </div>
            <div className="character-grid">
              {gameCharacters
                .filter(char => char.name.toLowerCase().includes(charFilter.toLowerCase()))
                .map(char => {
                  const isSelected = characters.get(showCharPicker)?.includes(char.id) ?? false;
                  return (
                    <div
                      key={char.id}
                      className={`character-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleCharacter(showCharPicker, char.id)}
                    >
                      <img
                        src={getCharacterImageUrl(gameId, char.id) ?? ''}
                        alt={char.name}
                        className="character-option-img"
                      />
                      <span className="character-option-name">{char.name}</span>
                      {isSelected && (
                        <div className="selected-indicator">
                          <i className="fas fa-check" />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <div className="manual-standings-footer">
        <button className="btn-outline" onClick={onCancel} disabled={finishing}>
          {t('common.cancel')}
        </button>
        <button
          className="btn-primary"
          onClick={handleFinish}
          disabled={finishing}
        >
          {finishing ? t('tournament.create.manualFinishing') : t('tournament.create.manualFinish')}
        </button>
      </div>
    </div>
  );
}

export default ManualStandingsInput;
