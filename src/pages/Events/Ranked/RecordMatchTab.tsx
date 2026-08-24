import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalParticipant } from '@/models/types';
import { getAllParticipantsAsync, getAllParticipants } from '@/services/participants/participantService';
import {
  recordMatch,
  getRankColor,
  getRankIcon,
  type MatchResult,
} from '@/services/ranking/rankingService';
import { validateDuelChallenge, getDuelChallenge, completeDuelChallenge } from '@/services/duels/duelService';
import './RecordMatchTab.css';

interface RecordMatchTabProps {
  matchType: 'duel' | 'matchmaking';
  selectedChallengeId?: string | null;
  onMatchRecorded?: () => void;
}

function RecordMatchTab({ matchType, selectedChallengeId, onMatchRecorded }: RecordMatchTabProps) {
  const navigate = useNavigate();
  
  // All participants (for selectors)
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);

  // Record match
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);

  // Duel validation
  const [duelValidationError, setDuelValidationError] = useState('');
  const [duelValidationWarnings, setDuelValidationWarnings] = useState<string[]>([]);

  // Participant name lookup
  const participantMap = new Map(allParticipants.map((p) => [p.id, p]));

  useEffect(() => {
    // Load participants for selectors — cached first, then server
    const cached = getAllParticipants();
    if (cached.length) setAllParticipants(cached);
    getAllParticipantsAsync().then((data) => { if (data.length) setAllParticipants(data); });
  }, []);

  // Auto-populate from selected challenge
  useEffect(() => {
    if (selectedChallengeId && allParticipants.length > 0) {
      getDuelChallenge(selectedChallengeId).then(challenge => {
        if (challenge) {
          setPlayerAId(challenge.challengerId);
          setPlayerBId(challenge.challengedId);
          setWinnerId('');
          setLastResult(null);
        }
      });
    }
  }, [selectedChallengeId, allParticipants]);

  // Validate duel when players change (skip if from selected challenge)
  useEffect(() => {
    // If this is from a selected challenge, skip validation
    if (selectedChallengeId) {
      setDuelValidationError('');
      setDuelValidationWarnings([]);
      return;
    }

    if (matchType === 'duel' && playerAId && playerBId) {
      validateDuelChallenge(playerAId, playerBId).then(result => {
        if (!result.valid) {
          setDuelValidationError(result.error || '');
          setDuelValidationWarnings([]);
        } else {
          setDuelValidationError('');
          setDuelValidationWarnings(result.warnings || []);
        }
      });
    } else {
      setDuelValidationError('');
      setDuelValidationWarnings([]);
    }
  }, [playerAId, playerBId, matchType, selectedChallengeId]);

  async function handleRecord() {
    if (!playerAId || !playerBId) { setRecordError('Select both participants.'); return; }
    if (playerAId === playerBId) { setRecordError('A participant cannot face itself.'); return; }
    if (!winnerId) { setRecordError('Select who won.'); return; }
    if (matchType === 'duel' && duelValidationError && !selectedChallengeId) { return; }

    setRecording(true);
    setRecordError('');
    setLastResult(null);
    try {
      const resolvedMatchType: 'duel' | 'matchmaking' | 'free' =
        selectedChallengeId ? 'duel' : matchType === 'matchmaking' ? 'matchmaking' : 'free';
      const result = await recordMatch(playerAId, playerBId, winnerId, resolvedMatchType);
      setLastResult(result);

      // If this was from a challenge, mark it as completed
      if (selectedChallengeId && result.match) {
        completeDuelChallenge(selectedChallengeId, result.match.id);
      }

      // Patch the local participants list with the updated ELO values
      const pA = (result as unknown as { updatedParticipantA?: GlobalParticipant }).updatedParticipantA;
      const pB = (result as unknown as { updatedParticipantB?: GlobalParticipant }).updatedParticipantB;
      if (pA || pB) {
        setAllParticipants((prev) =>
          prev.map((p) => {
            if (pA && p.id === pA.id) return pA;
            if (pB && p.id === pB.id) return pB;
            return p;
          })
        );
      }

      // Reset form
      setPlayerAId('');
      setPlayerBId('');
      setWinnerId('');

      // Notify parent
      if (onMatchRecorded) {
        setTimeout(() => onMatchRecorded(), 1500);
      }
    } catch (err: unknown) {
      setRecordError(err instanceof Error ? err.message : 'Error recording match.');
    } finally {
      setRecording(false);
    }
  }

  function pName(id: string) {
    return participantMap.get(id)?.name ?? id;
  }

  return (
    <div className="record-match-tab">
      <div className="card rk-record-card">
        <div className="rk-record-header">
          <span className="rk-record-icon"><i className="fas fa-gamepad" /></span>
          <div>
            <h2>Record Match</h2>
            <p>Select two players and who won. ELO points are calculated and updated automatically.</p>
          </div>
        </div>

        {allParticipants.length < 2 && (
          <div className="rk-warn">
            You need at least 2 participants to record a match.{' '}
            <button className="btn-link" onClick={() => navigate('/participants')}>
              Go to Participants →
            </button>
          </div>
        )}

        {allParticipants.length >= 2 && (
          <>
            <div className="rk-matchup">
              {/* Player A */}
              <div className="rk-player-slot">
                <label className="rk-slot-label">Player 1</label>
                <select
                  className="rk-select"
                  value={playerAId}
                  onChange={(e) => { setPlayerAId(e.target.value); setWinnerId(''); setLastResult(null); }}
                >
                  <option value="">— Select player —</option>
                  {allParticipants
                    .filter((p) => p.id !== playerBId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.alias ? ` (${p.alias})` : ''} — {p.eloPoints != null ? `${p.eloPoints} pts` : 'unranked'}
                      </option>
                    ))}
                </select>
                {playerAId && (
                  <EloPreview
                    participant={participantMap.get(playerAId)!}
                    isWinner={winnerId === playerAId}
                    onSetWinner={() => setWinnerId(playerAId)}
                  />
                )}
              </div>

              <div className="rk-vs">VS</div>

              {/* Player B */}
              <div className="rk-player-slot">
                <label className="rk-slot-label">Player 2</label>
                <select
                  className="rk-select"
                  value={playerBId}
                  onChange={(e) => { setPlayerBId(e.target.value); setWinnerId(''); setLastResult(null); }}
                >
                  <option value="">— Select player —</option>
                  {allParticipants
                    .filter((p) => p.id !== playerAId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.alias ? ` (${p.alias})` : ''} — {p.eloPoints != null ? `${p.eloPoints} pts` : 'unranked'}
                      </option>
                    ))}
                </select>
                {playerBId && (
                  <EloPreview
                    participant={participantMap.get(playerBId)!}
                    isWinner={winnerId === playerBId}
                    onSetWinner={() => setWinnerId(playerBId)}
                  />
                )}
              </div>
            </div>

            {/* Duel validation errors/warnings */}
            {matchType === 'duel' && duelValidationError && (
              <div className="rk-error">
                <i className="fas fa-exclamation-circle" /> {duelValidationError}
              </div>
            )}

            {matchType === 'duel' && duelValidationWarnings.length > 0 && (
              <div className="rk-warn">
                <i className="fas fa-exclamation-triangle" />
                {duelValidationWarnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}

            {playerAId && playerBId && (
              <div className="rk-winner-prompt">
                <p>Who won?</p>
                <div className="rk-winner-btns">
                  <button
                    className={`rk-winner-btn ${winnerId === playerAId ? 'selected' : ''}`}
                    onClick={() => setWinnerId(playerAId)}
                  >
                    <i className="fas fa-crown" /> {pName(playerAId)}
                  </button>
                  <button
                    className={`rk-winner-btn ${winnerId === playerBId ? 'selected' : ''}`}
                    onClick={() => setWinnerId(playerBId)}
                  >
                    <i className="fas fa-crown" /> {pName(playerBId)}
                  </button>
                </div>
              </div>
            )}

            {recordError && <p className="rk-error">{recordError}</p>}

            <div className="rk-record-actions">
              <button
                className="btn btn-primary"
                onClick={handleRecord}
                disabled={recording || !playerAId || !playerBId || !winnerId || (matchType === 'duel' && !!duelValidationError)}
              >
                {recording ? 'Calculating...' : 'Confirm Result'}
              </button>
            </div>

            {/* Result feedback */}
            {lastResult && (
              <div className="rk-result-box">
                <h4>Result recorded!</h4>
                <div className="rk-result-row">
                  <ResultCard r={lastResult.playerA} isWinner={lastResult.playerA.id === lastResult.match.winnerId} />
                  <span className="rk-result-vs">vs</span>
                  <ResultCard r={lastResult.playerB} isWinner={lastResult.playerB.id === lastResult.match.winnerId} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function EloPreview({
  participant,
  isWinner,
  onSetWinner,
}: {
  participant: GlobalParticipant;
  isWinner: boolean;
  onSetWinner: () => void;
}) {
  const pts = participant.eloPoints;
  const rank = participant.eloRank;
  return (
    <div className={`rk-elo-preview ${isWinner ? 'winner-preview' : ''}`} onClick={onSetWinner}>
      <span className="rk-elo-rank-icon"><i className={getRankIcon(rank)} /></span>
      <div>
        <span className="rk-elo-rank-name" style={{ color: getRankColor(rank) }}>{rank}</span>
        <span className="rk-elo-pts">{pts != null ? `${pts.toLocaleString()} pts` : 'unranked'}</span>
      </div>
      {isWinner && <span className="rk-winner-crown"><i className="fas fa-crown" /> Winner</span>}
    </div>
  );
}

function ResultCard({
  r,
  isWinner,
}: {
  r: { name: string; pointsBefore: number; pointsAfter: number; delta: number; rankBefore: string; rankAfter: string };
  isWinner: boolean;
}) {
  return (
    <div className={`rk-result-card ${isWinner ? 'winner' : 'loser'}`}>
      <span className="rk-result-name">{isWinner ? <i className="fas fa-crown" /> : ''} {r.name}</span>
      <span className="rk-result-pts">
        {r.pointsBefore} → <strong>{r.pointsAfter}</strong>
      </span>
      <span className={`rk-result-delta ${r.delta >= 0 ? 'positive' : 'negative'}`}>
        {r.delta >= 0 ? '+' : ''}{r.delta} pts
      </span>
      {r.rankBefore !== r.rankAfter && (
        <span className="rk-result-rankup">
          {r.rankBefore} → {r.rankAfter}
        </span>
      )}
    </div>
  );
}

export default RecordMatchTab;
