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
  const handleSelectWinner = (participantId: string | null) => {
    if (!participantId || readOnly || match.status === 'completed') return;
    if (!match.participant1Id || !match.participant2Id) return;
    
    onSelectWinner(match.id, participantId);
  };

  const isWinner = (participantId: string | null) => {
    return match.winnerId === participantId;
  };

  const isLoser = (participantId: string | null) => {
    return match.loserId === participantId;
  };

  const canSelect = !readOnly && match.participant1Id && match.participant2Id;
  
  // Check if this is a ghost match (TBD vs TBD that was auto-completed)
  const isGhostMatch = match.status === 'completed' && 
                       !match.participant1Id && 
                       !match.participant2Id && 
                       !match.winnerId;

  return (
    <div className={`match-card ${isGrandFinal ? 'grand-final-match' : ''} ${isGhostMatch ? 'ghost-match' : ''}`}>
      {/* Left column: match id + status */}
      <div className="match-header">
        <span className="match-id">Match {match.matchNumber}</span>
        {match.status === 'completed' && !isGhostMatch && (
          <span className="match-status completed">✓</span>
        )}
        {isGhostMatch && (
          <span className="match-status ghost">Auto-BYE</span>
        )}
        {match.status === 'pending' && (!match.participant1Id || !match.participant2Id) && (
          <span className="match-status pending">Waiting</span>
        )}
      </div>

      {/* Right column: participants stacked vertically */}
      <div className="match-body">
        <div className="match-participants">
          <div
            className={`participant ${isWinner(match.participant1Id) ? 'winner' : ''} ${isLoser(match.participant1Id) ? 'loser' : ''} ${canSelect ? 'selectable' : ''}`}
            onClick={() => canSelect && handleSelectWinner(match.participant1Id)}
          >
            <span className="participant-name">{participant1Name}</span>
            {isWinner(match.participant1Id) && <span className="winner-badge">W</span>}
          </div>

          <div className="match-divider">vs</div>

          <div
            className={`participant ${isWinner(match.participant2Id) ? 'winner' : ''} ${isLoser(match.participant2Id) ? 'loser' : ''} ${canSelect ? 'selectable' : ''}`}
            onClick={() => canSelect && handleSelectWinner(match.participant2Id)}
          >
            <span className="participant-name">{participant2Name}</span>
            {isWinner(match.participant2Id) && <span className="winner-badge">W</span>}
          </div>
        </div>

        {canSelect && match.status !== 'completed' && (
          <div className="match-hint">Click to select winner</div>
        )}
      </div>
    </div>
  );
}

export default MatchCard;
