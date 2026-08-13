import { useState } from 'react';
import { Match } from '@/models/types';
import './MatchCard.css';

interface MatchCardProps {
  match: Match;
  participant1Name: string;
  participant2Name: string;
  onSelectWinner: (matchId: string, winnerId: string) => void;
  readOnly?: boolean;
  isGrandFinal?: boolean;
}

function MatchCard({
  match,
  participant1Name,
  participant2Name,
  onSelectWinner,
  readOnly = false,
  isGrandFinal = false,
}: MatchCardProps) {
  // ID of participant pending confirmation, null = no pending selection
  const [pendingWinnerId, setPendingWinnerId] = useState<string | null>(null);

  const canSelect = !readOnly && match.participant1Id && match.participant2Id && match.status !== 'completed';

  const handleClickParticipant = (participantId: string | null) => {
    if (!participantId || !canSelect) return;
    // If same participant clicked again, cancel
    if (pendingWinnerId === participantId) {
      setPendingWinnerId(null);
      return;
    }
    setPendingWinnerId(participantId);
  };

  const handleConfirm = () => {
    if (!pendingWinnerId) return;
    onSelectWinner(match.id, pendingWinnerId);
    setPendingWinnerId(null);
  };

  const handleCancel = () => {
    setPendingWinnerId(null);
  };

  const isWinner   = (id: string | null) => match.winnerId === id;
  const isLoser    = (id: string | null) => match.loserId === id;
  const isPending  = (id: string | null) => pendingWinnerId === id;

  const isGhostMatch = match.status === 'completed' &&
    !match.participant1Id && !match.participant2Id && !match.winnerId;

  const pendingName = pendingWinnerId === match.participant1Id
    ? participant1Name
    : participant2Name;

  return (
    <div className={`match-card ${isGrandFinal ? 'grand-final-match' : ''} ${isGhostMatch ? 'ghost-match' : ''} ${pendingWinnerId ? 'confirming' : ''}`}>

      {/* Left column: match id + status */}
      <div className="match-header">
        <span className="match-id">Match {match.matchNumber}</span>
        {match.status === 'completed' && !isGhostMatch && (
          <span className="match-status completed"><i className="fas fa-check" /></span>
        )}
        {isGhostMatch && (
          <span className="match-status ghost">Auto-BYE</span>
        )}
        {match.status === 'pending' && (!match.participant1Id || !match.participant2Id) && (
          <span className="match-status pending">Waiting</span>
        )}
      </div>

      {/* Right column */}
      <div className="match-body">
        <div className="match-participants">
          {/* Participant 1 */}
          <div
            className={`participant
              ${isWinner(match.participant1Id) ? 'winner' : ''}
              ${isLoser(match.participant1Id) ? 'loser' : ''}
              ${isPending(match.participant1Id) ? 'pending-winner' : ''}
              ${canSelect ? 'selectable' : ''}`}
            onClick={() => handleClickParticipant(match.participant1Id)}
          >
            <span className="participant-name">{participant1Name}</span>
            {isWinner(match.participant1Id) && <span className="winner-badge">W</span>}
            {isPending(match.participant1Id) && <span className="pending-badge">?</span>}
          </div>

          <div className="match-divider">vs</div>

          {/* Participant 2 */}
          <div
            className={`participant
              ${isWinner(match.participant2Id) ? 'winner' : ''}
              ${isLoser(match.participant2Id) ? 'loser' : ''}
              ${isPending(match.participant2Id) ? 'pending-winner' : ''}
              ${canSelect ? 'selectable' : ''}`}
            onClick={() => handleClickParticipant(match.participant2Id)}
          >
            <span className="participant-name">{participant2Name}</span>
            {isWinner(match.participant2Id) && <span className="winner-badge">W</span>}
            {isPending(match.participant2Id) && <span className="pending-badge">?</span>}
          </div>
        </div>

        {/* Confirmation bar — appears below participants when a selection is pending */}
        {pendingWinnerId ? (
          <div className="confirm-bar">
            <span className="confirm-label">Winner: <strong>{pendingName}</strong>?</span>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-yes" onClick={handleConfirm}><i className="fas fa-check" /> Confirm</button>
              <button className="confirm-btn confirm-no"  onClick={handleCancel}><i className="fas fa-xmark" /> Cancel</button>
            </div>
          </div>
        ) : (
          canSelect && (
            <div className="match-hint">Click a player to select winner</div>
          )
        )}
      </div>
    </div>
  );
}

export default MatchCard;
