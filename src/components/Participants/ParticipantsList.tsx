import { useState } from 'react';
import { Participant } from '@/models/types';
import './ParticipantsList.css';

interface ParticipantsListProps {
  participants: Participant[];
  onRemove: (id: string) => void;
  onUpdate: (id: string, newName: string) => void;
  readOnly?: boolean;
}

function ParticipantsList({ 
  participants, 
  onRemove, 
  onUpdate,
  readOnly = false 
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

  return (
    <div className="participants-list">
      {participants.map((participant, index) => (
        <div key={participant.id} className="participant-item card">
          <div className="participant-seed">#{participant.seed || index + 1}</div>
          
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
              {participant.eliminated && (
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
      ))}
    </div>
  );
}

export default ParticipantsList;
