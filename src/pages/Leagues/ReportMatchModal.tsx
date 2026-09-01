import { useState, useRef } from 'react';
import { League, LeagueMatch, GlobalParticipant } from '@/models/types';
import { useAuth } from '@/contexts/AuthContext';
import { reportMatchResult, resolveLeagueMatch } from '@/services/leagues/leagueService';
import './ReportMatchModal.css';

interface ReportMatchModalProps {
  league: League;
  match: LeagueMatch;
  participants: Map<string, GlobalParticipant>;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_EVIDENCE_SIZE_MB = 4;
const MAX_EVIDENCE_SIZE_BYTES = MAX_EVIDENCE_SIZE_MB * 1024 * 1024;

function ReportMatchModal({ league, match, participants, onClose, onSuccess }: ReportMatchModalProps) {
  const { isAdmin } = useAuth();
  const [winnerId, setWinnerId] = useState(match.participant1Id);
  const [score1, setScore1] = useState(2);
  const [score2, setScore2] = useState(0);
  const [isNoShow, setIsNoShow] = useState(false);
  const [noShowParticipantId, setNoShowParticipantId] = useState(match.participant1Id);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  const p1 = participants.get(match.participant1Id);
  const p2 = participants.get(match.participant2Id);
  const p1Name = p1 ? (p1.alias?.trim() || p1.name) : 'Unknown';
  const p2Name = p2 ? (p2.alias?.trim() || p2.name) : 'Unknown';

  const winScore = Math.ceil(league.gamesPerMatch / 2);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
      setError(`Evidence image is too large. Maximum is ${MAX_EVIDENCE_SIZE_MB}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setEvidence(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (submittingRef.current) {
      console.log('[ReportMatchModal] Already submitting, ignoring duplicate click');
      return;
    }

    if (!isNoShow && (score1 < winScore && score2 < winScore)) {
      setError(`One player must win ${winScore} games (Best of ${league.gamesPerMatch})`);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError('');

    const baseResult = {
      winnerId: isNoShow ? (noShowParticipantId === match.participant1Id ? match.participant2Id : match.participant1Id) : winnerId,
      score: `${score1}-${score2}`,
      isNoShow,
      noShowParticipantId: isNoShow ? noShowParticipantId : undefined,
    };

    let result = null;
    if (isAdmin && (match.status === 'pending_review' || match.status === 'reported')) {
      result = await resolveLeagueMatch(league.id, match.id, baseResult);
    } else {
      result = await reportMatchResult(league.id, match.id, {
        ...baseResult,
        evidence: evidence || undefined,
      });
    }

    submittingRef.current = false;
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
      if (value === winScore) {
        setScore2(Math.min(score2, winScore - 1));
        setWinnerId(match.participant1Id);
      } else if (score2 === winScore && value > score2) {
        // If p2 was already at winning score, p1 can't pass it
        setScore1(Math.min(value, score2 - 1));
      }
    } else {
      setScore2(value);
      if (value === winScore) {
        setScore1(Math.min(score1, winScore - 1));
        setWinnerId(match.participant2Id);
      } else if (score1 === winScore && value > score1) {
        setScore2(Math.min(value, score1 - 1));
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

          {match.reportedResults && match.reportedResults.length > 0 && (
            <div className="reported-results">
              <h4>Previous reports</h4>
              {match.reportedResults.map((r) => {
                const reporter = participants.get(r.participantId);
                const winner = participants.get(r.winnerId);
                return (
                  <div key={r.participantId} className="reported-result">
                    <strong>{reporter?.alias?.trim() || reporter?.name || 'Unknown'}</strong>:{' '}
                    {winner?.alias?.trim() || winner?.name || 'Unknown'} wins {r.score}
                    {r.isNoShow ? ' (no-show)' : ''}
                    {r.evidence ? ' [with evidence]' : ''}
                  </div>
                );
              })}
            </div>
          )}

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
                      {Array.from({ length: winScore + 1 }, (_, i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                  <span className="score-separator">-</span>
                  <div className="score-input-group">
                    <span className="score-player-name">{p2Name}</span>
                    <select value={score2} onChange={(e) => handleScoreChange(2, Number(e.target.value))}>
                      {Array.from({ length: winScore + 1 }, (_, i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {!(isAdmin && (match.status === 'pending_review' || match.status === 'reported')) && (
            <div className="form-section">
              <label>Evidence (optional, max {MAX_EVIDENCE_SIZE_MB}MB)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />
              {evidence && <div className="evidence-preview"><img src={evidence} alt="Evidence" /></div>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? 'Submitting...'
              : isAdmin && match.status === 'pending_review'
                ? 'Resolve'
                : 'Submit Result'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportMatchModal;
