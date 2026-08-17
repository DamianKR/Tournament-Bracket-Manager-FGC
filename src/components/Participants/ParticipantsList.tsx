import { useState } from 'react';
import { Participant } from '@/models/types';
import './ParticipantsList.css';

interface ParticipantsListProps {
  participants: Participant[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, newName: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  readOnly?: boolean;
  /** When true: show finalPosition, hide seed, sort by placement */
  tournamentMode?: boolean;
}

function ordinal(pos: number): string {
  if (pos % 100 >= 11 && pos % 100 <= 13) return `${pos}th`;
  if (pos % 10 === 1) return `${pos}st`;
  if (pos % 10 === 2) return `${pos}nd`;
  if (pos % 10 === 3) return `${pos}rd`;
  return `${pos}th`;
}

function getPositionLabel(pos: number): string {
  if (pos === 1) return '🥇 1st';
  if (pos === 2) return '🥈 2nd';
  if (pos === 3) return '🥉 3rd';
  return ordinal(pos);
}

function ParticipantsList({
  participants,
  onRemove,
  onUpdate,
  onMoveUp,
  onMoveDown,
  readOnly = false,
  tournamentMode = false,
}: ParticipantsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = (participant: Participant) => {
    if (readOnly) return;
    setEditingId(participant.id);
    setEditValue(participant.name);
  };

  const handleSaveEdit = (id: string) => {
    if (editValue.trim() && editValue !== participants.find(p => p.id === id)?.name) {
      onUpdate(id, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  if (participants.length === 0) {
    return (
      <div className="participants-empty card">
        <p className="text-secondary text-center">No participants yet</p>
      </div>
    );
  }

  // In tournament mode: sort alive first (no position), then by finalPosition asc.
  const sorted = tournamentMode
    ? [...participants].sort((a, b) => {
        if (!a.finalPosition && !b.finalPosition) return 0;
        if (!a.finalPosition) return -1;
        if (!b.finalPosition) return 1;
        return a.finalPosition - b.finalPosition;
      })
    : participants;

  return (
    <div className="participants-list">
      {sorted.map((participant, index) => {
        const alive = tournamentMode && !participant.finalPosition;
        const posClass = tournamentMode && participant.finalPosition === 1 ? 'position-first'
          : tournamentMode && participant.finalPosition === 2 ? 'position-second'
          : tournamentMode && participant.finalPosition === 3 ? 'position-third'
          : '';

        return (
        <div key={participant.id} className={`participant-item card ${posClass}`}>
          {tournamentMode ? (
            participant.finalPosition
              ? <div className="participant-position">{getPositionLabel(participant.finalPosition)}</div>
              : <div className="participant-position-dash">—</div>
          ) : (
            <div className="participant-seed">#{participant.seed || index + 1}</div>
          )}

          {editingId === participant.id ? (
            <div className="participant-edit">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => handleKeyPress(e, participant.id)}
                onBlur={() => handleSaveEdit(participant.id)}
                autoFocus
                className="participant-edit-input"
              />
            </div>
          ) : (
            <div
              className="participant-name"
              onDoubleClick={() => handleStartEdit(participant)}
            >
              {participant.name}
              {tournamentMode && alive && (
                <span className="not-concluded-badge">
                  <i className="fas fa-hourglass-half" /> Not Concluded
                </span>
              )}
              {tournamentMode && participant.eliminated && (
                <span className="eliminated-badge">Eliminated</span>
              )}
            </div>
          )}

          {!readOnly && (
            <div className="participant-actions">
              {editingId !== participant.id && (
                <>
                  <button
                    className="btn-icon"
                    onClick={() => handleStartEdit(participant)}
                    title="Edit name"
                  >
                    ✏️
                  </button>
                  {onMoveUp && (
                    <button
                      className="btn-icon"
                      onClick={() => onMoveUp(participant.id)}
                      disabled={index === 0}
                      title="Move up"
                    >
                      ⬆️
                    </button>
                  )}
                  {onMoveDown && (
                    <button
                      className="btn-icon"
                      onClick={() => onMoveDown(participant.id)}
                      disabled={index === sorted.length - 1}
                      title="Move down"
                    >
                      ⬇️
                    </button>
                  )}
                  <button
                    className="btn-icon btn-danger"
                    onClick={() => onRemove(participant.id)}
                    title="Remove participant"
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

export default ParticipantsList;
