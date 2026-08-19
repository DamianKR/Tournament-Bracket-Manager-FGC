import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Participant, GlobalParticipant } from '@/models/types';
import { getGame, getCharacter } from '@/data/games';
import {
  getAllParticipants,
  getAllParticipantsAsync,
} from '@/services/participants/participantService';
import './ParticipantsList.css';
import '@/pages/Participants/ParticipantsPage.css';

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

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

type IdentityEntity = { globalParticipantId?: string; name: string; alias?: string };

function ParticipantsList({
  participants,
  onRemove,
  onUpdate,
  onMoveUp,
  onMoveDown,
  readOnly = false,
  tournamentMode = false,
}: ParticipantsListProps) {
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [allGlobal, setAllGlobal] = useState<GlobalParticipant[]>([]);

  useEffect(() => {
    getAllParticipantsAsync()
      .then(setAllGlobal)
      .catch(() => setAllGlobal(getAllParticipants()));
  }, []);

  const resolveGlobal = (p: IdentityEntity): GlobalParticipant | null => {
    if (p.globalParticipantId) {
      const gp = allGlobal.find((g) => g.id === p.globalParticipantId);
      if (gp) return gp;
    }
    return allGlobal.find(
      (g) => g.name.toLowerCase() === p.name.trim().toLowerCase()
    ) || null;
  };

  const renderIdentity = (entity: IdentityEntity, onClick?: () => void, isMember = false) => {
    const gp = resolveGlobal(entity);
    const displayName = gp?.name || entity.name;
    const displayAlias = gp?.alias || entity.alias;
    const gameId = gp?.gameId;
    const characterId = gp?.mainCharacterId;

    return (
      <div
        className={`pp-item-info participant-identity ${isMember ? 'participant-member-identity' : ''}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <div
          className="pp-item-avatar"
          style={{ background: avatarColor(displayName) }}
        >
          {initials(displayName)}
        </div>
        <div className="pp-item-name-block">
          <div className="pp-item-name-row">
            <span className="pp-item-name">{displayName}</span>
            {displayAlias && (
              <span className="pp-item-alias">{displayAlias}</span>
            )}
          </div>
          {gameId && characterId && (
            <div className="pp-item-tags">
              <span className="pp-item-tag pp-item-tag-game">
                {getGame(gameId)?.shortName}
              </span>
              <span className="pp-item-tag pp-item-tag-char">
                {getCharacter(gameId, characterId)?.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

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
                className="participant-info"
                onDoubleClick={() => !readOnly && handleStartEdit(participant)}
              >
                {participant.members && participant.members.length > 0 ? (
                  <div className="participant-team">
                    <div className="participant-team-name">{participant.name}</div>
                    <div className="participant-team-members">
                      {participant.members.map((m) => (
                        <div key={m.globalParticipantId || m.name}>
                          {renderIdentity(m, () => {
                            if (m.globalParticipantId) {
                              navigate(`/participants/${m.globalParticipantId}`);
                            }
                          }, true)}
                        </div>
                      ))}
                    </div>
                    {tournamentMode && alive && (
                      <span className="not-concluded-badge">
                        <i className="fas fa-hourglass-half" /> Not Concluded
                      </span>
                    )}
                    {tournamentMode && participant.eliminated && (
                      <span className="eliminated-badge">Eliminated</span>
                    )}
                  </div>
                ) : (
                  <>
                    {renderIdentity(participant, () => {
                      if (readOnly && participant.globalParticipantId) {
                        navigate(`/participants/${participant.globalParticipantId}`);
                      }
                    })}
                    {tournamentMode && alive && (
                      <span className="not-concluded-badge">
                        <i className="fas fa-hourglass-half" /> Not Concluded
                      </span>
                    )}
                    {tournamentMode && participant.eliminated && (
                      <span className="eliminated-badge">Eliminated</span>
                    )}
                  </>
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
                      <i className="fas fa-pencil-alt" />
                    </button>
                    {onMoveUp && (
                      <button
                        className="btn-icon"
                        onClick={() => onMoveUp(participant.id)}
                        disabled={index === 0}
                        title="Move up"
                      >
                        <i className="fas fa-arrow-up" />
                      </button>
                    )}
                    {onMoveDown && (
                      <button
                        className="btn-icon"
                        onClick={() => onMoveDown(participant.id)}
                        disabled={index === sorted.length - 1}
                        title="Move down"
                      >
                        <i className="fas fa-arrow-down" />
                      </button>
                    )}
                    <button
                      className="btn-icon btn-danger"
                      onClick={() => onRemove(participant.id)}
                      title="Remove participant"
                    >
                      <i className="fas fa-trash-alt" />
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
