import { useState, useEffect } from 'react';
import { GlobalParticipant } from '@/models/types';
import { useAuth } from '@/contexts/AuthContext';
import { getAllParticipantsAsync, getAllParticipants } from '@/services/participants/participantService';
import {
  recordMatch,
  getRankColor,
  getRankIcon,
  type MatchResult,
} from '@/services/ranking/rankingService';
import { getDuelChallenge, reportDuelResult, resolveConflict, completeDuelChallenge } from '@/services/duels/duelService';
import { DuelChallenge } from '@/models/duel';
import './RecordMatchTab.css';

const MAX_EVIDENCE_SIZE_MB = 4;
const MAX_EVIDENCE_SIZE_BYTES = MAX_EVIDENCE_SIZE_MB * 1024 * 1024;

interface RecordMatchTabProps {
  matchType: 'duel' | 'matchmaking';
  selectedChallengeId?: string | null;
  onMatchRecorded?: () => void;
}

function RecordMatchTab({ selectedChallengeId, onMatchRecorded }: RecordMatchTabProps) {
  const { user, isAdmin } = useAuth();

  // All participants (for selectors)
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);

  // Challenge data
  const [challenge, setChallenge] = useState<DuelChallenge | null>(null);

  // Record match
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);
  const [evidenceError, setEvidenceError] = useState('');

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
      getDuelChallenge(selectedChallengeId).then(ch => {
        if (ch) {
          setChallenge(ch);
          setPlayerAId(ch.challengerId);
          setPlayerBId(ch.challengedId);
          setWinnerId('');
          setLastResult(null);
          setEvidence('');
          setEvidenceFile(null);
        }
      });
    } else {
      setChallenge(null);
    }
  }, [selectedChallengeId, allParticipants]);

  // Check if current user is a participant in the challenge
  const isParticipant = challenge && user?.participantId && 
    (user.participantId === challenge.challengerId || user.participantId === challenge.challengedId);

  // Check if user has already reported
  const hasReported = challenge && user?.participantId && (
    (user.participantId === challenge.challengerId && challenge.challengerResult) ||
    (user.participantId === challenge.challengedId && challenge.challengedResult)
  );

  async function handleReportResult() {
    if (!challenge) return;
    if (!winnerId) { setRecordError('Select who won.'); return; }

    setRecording(true);
    setRecordError('');
    try {
      // Convert image file to base64 if selected
      let evidenceData = evidence;
      if (evidenceFile) {
        evidenceData = await fileToBase64(evidenceFile);
      }

      const updated = await reportDuelResult(challenge.id, winnerId, evidenceData || undefined);
      if (updated) {
        setChallenge(updated);
        setEvidenceFile(null);

        // If status is now 'completed', both results matched - record the match
        if (updated.status === 'completed') {
          const result = await recordMatch(playerAId, playerBId, winnerId, 'duel');
          setLastResult(result);

          // Link match to challenge
          if (result.match) {
            await completeDuelChallenge(updated.id, result.match.id);
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

          // Notify parent
          if (onMatchRecorded) {
            setTimeout(() => onMatchRecorded(), 2000);
          }
        } else if (updated.status === 'pending_review') {
          setRecordError('Results don\'t match. Waiting for admin review or other participant to report.');
        } else {
          setRecordError('Result reported. Waiting for other participant to report.');
        }
      }
    } catch (err: unknown) {
      setRecordError(err instanceof Error ? err.message : 'Error reporting result.');
    } finally {
      setRecording(false);
    }
  }

  async function handleAdminResolve() {
    if (!challenge || !isAdmin) return;
    if (!winnerId) { setRecordError('Select who won.'); return; }

    setRecording(true);
    setRecordError('');
    try {
      const updated = await resolveConflict(challenge.id, winnerId);
      if (updated) {
        // Record the match with admin's decision
        const result = await recordMatch(playerAId, playerBId, winnerId, 'duel');
        setLastResult(result);
        
        // Link match to challenge
        if (result.match) {
          await completeDuelChallenge(updated.id, result.match.id);
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

        // Notify parent
        if (onMatchRecorded) {
          setTimeout(() => onMatchRecorded(), 2000);
        }
      }
    } catch (err: unknown) {
      setRecordError(err instanceof Error ? err.message : 'Error resolving conflict.');
    } finally {
      setRecording(false);
    }
  }

  function pName(id: string) {
    return participantMap.get(id)?.name ?? id;
  }

  // If not admin and no challenge selected, show message
  if (!isAdmin && !selectedChallengeId) {
    return (
      <div className="record-match-tab">
        <div className="card rk-record-card">
          <div className="rk-record-notice">
            <i className="fas fa-info-circle" /> 
            <div>
              <h3>Report Match Results</h3>
              <p>To report a match result, accept a challenge from the "Manage Challenges" tab and click "Report Result".</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If admin but no challenge, allow free match recording
  if (isAdmin && !selectedChallengeId) {
    return <AdminFreeMatchRecording allParticipants={allParticipants} />;
  }

  return (
    <div className="record-match-tab">
      <div className="card rk-record-card">
        <div className="rk-record-header">
          <span className="rk-record-icon"><i className="fas fa-gamepad" /></span>
          <div>
            <h2>{challenge?.status === 'pending_review' ? 'Resolve Conflict' : 'Report Match Result'}</h2>
            <p>
              {challenge?.status === 'pending_review' 
                ? 'Both participants reported different results. Review evidence and decide the winner.'
                : 'Select the winner of this match. If both participants agree, the result will be recorded automatically.'}
            </p>
          </div>
        </div>

        {challenge && (
          <>
            <div className="rk-matchup">
              {/* Player A */}
              <div className="rk-player-slot">
                <label className="rk-slot-label">Player 1</label>
                <div className="rk-player-locked">
                  {pName(playerAId)}
                </div>
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
                <div className="rk-player-locked">
                  {pName(playerBId)}
                </div>
                {playerBId && (
                  <EloPreview
                    participant={participantMap.get(playerBId)!}
                    isWinner={winnerId === playerBId}
                    onSetWinner={() => setWinnerId(playerBId)}
                  />
                )}
              </div>
            </div>

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

            {/* Evidence section for pending_review */}
            {challenge.status === 'pending_review' && isAdmin && (
              <div className="rk-evidence-section">
                <h4>Reported Results</h4>
                <div className="rk-evidence-grid">
                  {challenge.challengerResult && (
                    <div className="rk-evidence-card">
                      <h5>{pName(challenge.challengerId)} reported:</h5>
                      <p><strong>Winner:</strong> {pName(challenge.challengerResult.winnerId)}</p>
                      {challenge.challengerResult.evidence && (
                        <div className="rk-evidence-image">
                          <img src={challenge.challengerResult.evidence} alt="Evidence" />
                        </div>
                      )}
                    </div>
                  )}
                  {challenge.challengedResult && (
                    <div className="rk-evidence-card">
                      <h5>{pName(challenge.challengedId)} reported:</h5>
                      <p><strong>Winner:</strong> {pName(challenge.challengedResult.winnerId)}</p>
                      {challenge.challengedResult.evidence && (
                        <div className="rk-evidence-image">
                          <img src={challenge.challengedResult.evidence} alt="Evidence" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Evidence upload for participants */}
            {challenge.status === 'accepted' && isParticipant && !hasReported && (
              <div className="rk-evidence-upload">
                <label>Evidence (optional - screenshot, max {MAX_EVIDENCE_SIZE_MB}MB)</label>
                <input
                  type="file"
                  className="rk-input"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setEvidenceError('');
                    if (file) {
                      if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
                        setEvidenceError(`Image too large. Maximum size is ${MAX_EVIDENCE_SIZE_MB}MB. Your image is ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
                        setEvidenceFile(null);
                        setEvidence('');
                        return;
                      }
                      setEvidenceFile(file);
                      const reader = new FileReader();
                      reader.onload = (event) => setEvidence((event.target?.result as string) || '');
                      reader.readAsDataURL(file);
                    } else {
                      setEvidenceFile(null);
                      setEvidence('');
                    }
                  }}
                />
                {evidenceError && <p className="rk-error">{evidenceError}</p>}
                {evidence && !evidenceError && (
                  <div className="rk-evidence-preview">
                    <img src={evidence} alt="Evidence preview" />
                  </div>
                )}
                <p className="rk-help-text">
                  Upload a screenshot of the result. This image will be stored with the challenge until the result is confirmed.
                </p>
              </div>
            )}

            {recordError && <p className="rk-error">{recordError}</p>}

            {/* Action buttons */}
            {challenge.status === 'pending_review' && isAdmin ? (
              <div className="rk-record-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleAdminResolve}
                  disabled={recording || !winnerId}
                >
                  {recording ? 'Resolving...' : 'Confirm Winner & Record Match'}
                </button>
              </div>
            ) : challenge.status === 'accepted' && isAdmin ? (
              <div className="rk-record-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleReportResult}
                  disabled={recording || !winnerId}
                >
                  {recording ? 'Recording...' : 'Confirm & Record Match'}
                </button>
              </div>
            ) : challenge.status === 'accepted' && isParticipant && !hasReported ? (
              <div className="rk-record-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleReportResult}
                  disabled={recording || !winnerId}
                >
                  {recording ? 'Reporting...' : 'Report Result'}
                </button>
              </div>
            ) : hasReported ? (
              <div className="rk-record-notice">
                <i className="fas fa-check-circle" /> You have already reported your result. Waiting for {
                  user?.participantId === challenge.challengerId ? pName(challenge.challengedId) : pName(challenge.challengerId)
                } to report.
              </div>
            ) : null}

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

// ── Admin Free Match Recording ────────────────────────────────────────────

function AdminFreeMatchRecording({ allParticipants }: { allParticipants: GlobalParticipant[] }) {
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);

  const participantMap = new Map(allParticipants.map((p) => [p.id, p]));

  async function handleRecord() {
    if (!playerAId || !playerBId) { setRecordError('Select both participants.'); return; }
    if (playerAId === playerBId) { setRecordError('A participant cannot face itself.'); return; }
    if (!winnerId) { setRecordError('Select who won.'); return; }

    setRecording(true);
    setRecordError('');
    setLastResult(null);
    try {
      const result = await recordMatch(playerAId, playerBId, winnerId, 'free');
      setLastResult(result);

      // Reset form
      setPlayerAId('');
      setPlayerBId('');
      setWinnerId('');
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
            <h2>Record Free Match</h2>
            <p>Record a match that wasn't part of a challenge. ELO points are calculated and updated automatically.</p>
          </div>
        </div>

        {allParticipants.length < 2 && (
          <div className="rk-warn">
            You need at least 2 participants to record a match.
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
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.alias ? `${p.alias} (${p.name})` : p.name} — {p.eloPoints != null ? `${p.eloPoints} pts` : 'unranked'}
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
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.alias ? `${p.alias} (${p.name})` : p.name} — {p.eloPoints != null ? `${p.eloPoints} pts` : 'unranked'}
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
                disabled={recording || !playerAId || !playerBId || !winnerId}
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
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
