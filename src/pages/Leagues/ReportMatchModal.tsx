import { useState } from 'react';
import { League, LeagueMatch, GlobalParticipant } from '@/models/types';
import { reportMatchResult } from '@/services/leagues/leagueService';
import './ReportMatchModal.css';

interface ReportMatchModalProps {
  league: League;
  match: LeagueMatch;
  participants: Map<string, GlobalParticipant>;
  onClose: () => void;
  onSuccess: () => void;
}

function ReportMatchModal({ league, match, participants, onClose, onSuccess }: ReportMatchModalProps) {
  const [winnerId, setWinnerId] = useState(match.participant1Id);
  const [score1, setScore1] = useState(2);
  const [score2, setScore2] = useState(0);
  const [isNoShow, setIsNoShow] = useState(false);
  const [noShowParticipantId, setNoShowParticipantId] = useState(match.participant1Id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const p1 = participants.get(match.participant1Id);
  const p2 = participants.get(match.participant2Id);
  const p1Name = p1 ? (p1.alias?.trim() || p1.name) : 'Unknown';
  const p2Name = p2 ? (p2.alias?.trim() || p2.name) : 'Unknown';

  const maxGames = Math.ceil(league.gamesPerMatch / 2);

  async function handleSubmit() {
    if (!isNoShow && (score1 < maxGames && score2 < maxGames)) {
      setError(`One player must win ${maxGames} games (Best of ${league.gamesPerMatch})`);
      return;
    }

    setSubmitting(true);
    setError('');

    const result = await reportMatchResult(league.id, match.id, {
      winnerId: isNoShow ? (noShowParticipantId === match.participant1Id ? match.participant2Id : match.participant1Id) : winnerId,
      score: `${score1}-${score2}`,
      isNoShow,
      noShowParticipantId: isNoShow ? noShowParticipantId : undefined,
    });

    setSubmitting(false);

    if (!result) {
      setError('Failed to report match result');
      return;
    }

    onSuccess();
  }

  function handleScoreChange(player: 1 | 2, value: number) {
    if (player === 1) {
      setScore1(value);
      if (value === maxGames) {
        setScore2(Math.min(score2, maxGames - 1));
        setWinnerId(match.participant1Id);
      }
    } else {
      setScore2(value);
      if (value === maxGames) {
        setScore1(Math.min(score1, maxGames - 1));
        setWinnerId(match.participant2Id);
      }
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content report-match-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Report Match Result</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="match-info">
            <div className="match-info-players">
              <span className="match-info-player">{p1Name}</span>
              <span className="match-info-vs">vs</span>
              <span className="match-info-player">{p2Name}</span>
            </div>
            <div className="match-info-meta">
              Week {match.week} • Round {match.round}
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isNoShow}
                onChange={(e) => setIsNoShow(e.target.checked)}
              />
              Mark as no-show
            </label>
          </div>

          {isNoShow ? (
            <div className="form-section">
              <label>Absent player</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    checked={noShowParticipantId === match.participant1Id}
                    onChange={() => setNoShowParticipantId(match.participant1Id)}
                  />
                  {p1Name}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={noShowParticipantId === match.participant2Id}
                    onChange={() => setNoShowParticipantId(match.participant2Id)}
                  />
                  {p2Name}
                </label>
              </div>
              <p className="form-hint">
                The absent player will lose ELO as if they lost the match.
              </p>
            </div>
          ) : (
            <>
              <div className="form-section">
                <label>Winner</label>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      checked={winnerId === match.participant1Id}
                      onChange={() => setWinnerId(match.participant1Id)}
                    />
                    {p1Name}
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={winnerId === match.participant2Id}
                      onChange={() => setWinnerId(match.participant2Id)}
                    />
                    {p2Name}
                  </label>
                </div>
              </div>

              <div className="form-section">
                <label>Score (Best of {league.gamesPerMatch})</label>
                <div className="score-inputs">
                  <div className="score-input-group">
                    <span className="score-player-name">{p1Name}</span>
                    <select value={score1} onChange={(e) => handleScoreChange(1, Number(e.target.value))}>
                      {Array.from({ length: maxGames + 1 }, (_, i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                  <span className="score-separator">-</span>
                  <div className="score-input-group">
                    <span className="score-player-name">{p2Name}</span>
                    <select value={score2} onChange={(e) => handleScoreChange(2, Number(e.target.value))}>
                      {Array.from({ length: maxGames + 1 }, (_, i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Result'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportMatchModal;
