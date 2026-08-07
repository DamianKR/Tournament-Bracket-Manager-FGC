import { Participant } from '@/models/types';
import { nextPowerOfTwo, calculateByes } from '@/engine/utils/bracketMath';
import './BracketPreview.css';

interface BracketPreviewProps {
  participants: Participant[];
}

function BracketPreview({ participants }: BracketPreviewProps) {
  const bracketSize = nextPowerOfTwo(participants.length);
  const byes = calculateByes(participants.length);
  const rounds = Math.log2(bracketSize);

  return (
    <div className="bracket-preview card">
      <div className="preview-stats">
        <div className="stat-item">
          <span className="stat-label">Participants:</span>
          <span className="stat-value">{participants.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Bracket Size:</span>
          <span className="stat-value">{bracketSize}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Byes:</span>
          <span className="stat-value">{byes}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Winner Rounds:</span>
          <span className="stat-value">{rounds}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Loser Rounds:</span>
          <span className="stat-value">{rounds > 1 ? 2 * (rounds - 1) : 0}</span>
        </div>
      </div>

      <div className="preview-info">
        <h3>Tournament Structure</h3>
        <ul>
          <li>
            <strong>Winner Bracket:</strong> {participants.length - 1} matches across {rounds} rounds
          </li>
          <li>
            <strong>Loser Bracket:</strong> {participants.length - 2} matches across{' '}
            {rounds > 1 ? 2 * (rounds - 1) : 0} rounds
          </li>
          <li>
            <strong>Grand Final:</strong> Best of 1 or 2 matches (with bracket reset if needed)
          </li>
        </ul>
        
        {byes > 0 && (
          <div className="preview-note">
            <strong>Note:</strong> {byes} participant{byes !== 1 ? 's' : ''} will receive a bye in the first round.
          </div>
        )}
      </div>
    </div>
  );
}

export default BracketPreview;
