import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalParticipant } from '@/models/types';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentCommunity, canAdminCurrentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;
  // Only allow write actions if the user is in their own community
  const isAdminHere = canAdminCurrentCommunity;

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
    if (!communityId) return;
    // Load participants for selectors — cached first, then server (filtered by community)
    const cached = getAllParticipants(communityId);
    if (cached.length) setAllParticipants(cached);
    getAllParticipantsAsync(communityId).then((data) => { if (data.length) setAllParticipants(data); });
  }, [communityId]);

  // Auto-populate from selected challenge
  useEffect(() => {
    if (selectedChallengeId && allParticipants.length > 0 && communityId) {
      getDuelChallenge(selectedChallengeId, communityId).then(ch => {
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
    if (!winnerId) { setRecordError(t('ranked.duelInfo.record.selectWon')); return; }

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
          const result = await recordMatch(playerAId, playerBId, winnerId, 'duel', communityId);
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
          setRecordError(t('ranked.duelInfo.record.resultsMismatch'));
        } else {
          setRecordError(t('ranked.duelInfo.record.resultReported'));
        }
      }
    } catch (err: unknown) {
      setRecordError(err instanceof Error ? err.message : t('ranked.duelInfo.record.errorRecord'));
    } finally {
      setRecording(false);
    }
  }

  async function handleAdminResolve() {
    if (!challenge || !isAdminHere) return;
    if (!winnerId) { setRecordError(t('ranked.duelInfo.record.selectWon')); return; }

    setRecording(true);
    setRecordError('');
    try {
      const updated = await resolveConflict(challenge.id, winnerId);
      if (updated) {
        // Record the match with admin's decision
        const result = await recordMatch(playerAId, playerBId, winnerId, 'duel', communityId);
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
      setRecordError(err instanceof Error ? err.message : t('ranked.duelInfo.record.errorResolve'));
    } finally {
      setRecording(false);
    }
  }

  function pName(id: string) {
    return participantMap.get(id)?.name ?? id;
  }

  // If not admin and no challenge selected, show message
  if (!isAdminHere && !selectedChallengeId) {
    return (
      <div className="record-match-tab">
        <div className="card rk-record-card">
          <div className="rk-record-notice">
            <i className="fas fa-info-circle" />
            <div>
              <h3>{t('ranked.duelInfo.record.title')}</h3>
              <p>{t('ranked.duelInfo.record.reportInstructions', { challenges: t('ranked.challenges.title'), reportResult: t('ranked.challenges.reportResult') })}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If admin (in own community) but no challenge, allow free match recording
  if (isAdminHere && !selectedChallengeId) {
    return <AdminFreeMatchRecording allParticipants={allParticipants} communityId={communityId} />;
  }

  return (
    <div className="record-match-tab">
      <div className="card rk-record-card">
        <div className="rk-record-header">
          <span className="rk-record-icon"><i className="fas fa-gamepad" /></span>
          <div>
            <h2>{challenge?.status === 'pending_review' ? t('ranked.duelInfo.record.resolveConflict') : t('ranked.duelInfo.record.title')}</h2>
            <p>
              {challenge?.status === 'pending_review'
                ? t('ranked.duelInfo.record.resolveDesc')
                : t('ranked.duelInfo.record.reportDesc')}
            </p>
          </div>
        </div>

        {challenge && (
          <>
            <div className="rk-matchup">
              {/* Player A */}
              <div className="rk-player-slot">
                <label className="rk-slot-label">{t('ranked.duelInfo.record.player1')}</label>
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

              <div className="rk-vs">{t('ranked.duelInfo.record.vs')}</div>

              {/* Player B */}
              <div className="rk-player-slot">
                <label className="rk-slot-label">{t('ranked.duelInfo.record.player2')}</label>
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
                <p>{t('ranked.duelInfo.record.whoWon')}</p>
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
            {challenge.status === 'pending_review' && isAdminHere && (
              <div className="rk-evidence-section">
                <h4>{t('ranked.duelInfo.record.reportedResults')}</h4>
                <div className="rk-evidence-grid">
                  {challenge.challengerResult && (
                    <div className="rk-evidence-card">
                      <h5>{pName(challenge.challengerId)} {t('ranked.duelInfo.record.reported')}</h5>
                      <p><strong>{t('ranked.duelInfo.record.winner')}</strong> {pName(challenge.challengerResult.winnerId)}</p>
                      {challenge.challengerResult.evidence && (
                        <div className="rk-evidence-image">
                          <img src={challenge.challengerResult.evidence} alt={t('ranked.duelInfo.record.evidenceAlt')} />
                        </div>
                      )}
                    </div>
                  )}
                  {challenge.challengedResult && (
                    <div className="rk-evidence-card">
                      <h5>{pName(challenge.challengedId)} {t('ranked.duelInfo.record.reported')}</h5>
                      <p><strong>{t('ranked.duelInfo.record.winner')}</strong> {pName(challenge.challengedResult.winnerId)}</p>
                      {challenge.challengedResult.evidence && (
                        <div className="rk-evidence-image">
                          <img src={challenge.challengedResult.evidence} alt={t('ranked.duelInfo.record.evidenceAlt')} />
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
                <label>{t('ranked.duelInfo.record.evidence', { size: MAX_EVIDENCE_SIZE_MB })}</label>
                <input
                  type="file"
                  className="rk-input"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setEvidenceError('');
                    if (file) {
                      if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
                        setEvidenceError(t('ranked.duelInfo.record.evidenceTooLarge', { max: MAX_EVIDENCE_SIZE_MB, size: (file.size / 1024 / 1024).toFixed(2) }));
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
                    <img src={evidence} alt={t('ranked.duelInfo.record.evidencePreviewAlt')} />
                  </div>
                )}
                <p className="rk-help-text">
                  {t('ranked.duelInfo.record.evidenceHelp')}
                </p>
              </div>
            )}

            {recordError && <p className="rk-error">{recordError}</p>}

            {/* Action buttons */}
            {challenge.status === 'pending_review' && isAdminHere ? (
              <div className="rk-record-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleAdminResolve}
                  disabled={recording || !winnerId}
                >
                  {recording ? t('ranked.duelInfo.record.resolving') : t('ranked.duelInfo.record.confirmWinner')}
                </button>
              </div>
            ) : challenge.status === 'accepted' && isAdminHere ? (
              <div className="rk-record-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleReportResult}
                  disabled={recording || !winnerId}
                >
                  {recording ? t('ranked.duelInfo.record.recording') : t('ranked.duelInfo.record.confirmRecord')}
                </button>
              </div>
            ) : challenge.status === 'accepted' && isParticipant && !hasReported ? (
              <div className="rk-record-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleReportResult}
                  disabled={recording || !winnerId}
                >
                  {recording ? t('ranked.duelInfo.record.reporting') : t('ranked.duelInfo.record.reportResult')}
                </button>
              </div>
            ) : hasReported ? (
              <div className="rk-record-notice">
                <i className="fas fa-check-circle" /> {t('ranked.duelInfo.record.alreadyReported', { player: user?.participantId === challenge.challengerId ? pName(challenge.challengedId) : pName(challenge.challengerId) })}
              </div>
            ) : null}

            {/* Result feedback */}
            {lastResult && (
              <div className="rk-result-box">
                <h4>{t('ranked.duelInfo.record.resultRecorded')}</h4>
                <div className="rk-result-row">
                  <ResultCard r={lastResult.playerA} isWinner={lastResult.playerA.id === lastResult.match.winnerId} />
                  <span className="rk-result-vs">{t('ranked.duelInfo.record.vs')}</span>
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

function AdminFreeMatchRecording({ allParticipants, communityId }: { allParticipants: GlobalParticipant[]; communityId?: string }) {
  const { t } = useTranslation();
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);

  const participantMap = new Map(allParticipants.map((p) => [p.id, p]));

  async function handleRecord() {
    if (!playerAId || !playerBId) { setRecordError(t('ranked.duelInfo.record.selectBoth')); return; }
    if (playerAId === playerBId) { setRecordError(t('ranked.duelInfo.record.sameParticipant')); return; }
    if (!winnerId) { setRecordError(t('ranked.duelInfo.record.selectWon')); return; }

    setRecording(true);
    setRecordError('');
    setLastResult(null);
    try {
      const result = await recordMatch(playerAId, playerBId, winnerId, 'free', communityId);
      setLastResult(result);

      // Reset form
      setPlayerAId('');
      setPlayerBId('');
      setWinnerId('');
    } catch (err: unknown) {
      setRecordError(err instanceof Error ? err.message : t('ranked.duelInfo.record.errorFreeMatch'));
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
            <h2>{t('ranked.duelInfo.record.adminTitle')}</h2>
            <p>{t('ranked.duelInfo.record.reportDesc')}</p>
          </div>
        </div>

        {allParticipants.length < 2 && (
          <div className="rk-warn">
            {t('ranked.duelInfo.record.needParticipants')}
          </div>
        )}

        {allParticipants.length >= 2 && (
          <>
            <div className="rk-matchup">
              {/* Player A */}
              <div className="rk-player-slot">
                <label className="rk-slot-label">{t('ranked.duelInfo.record.player1')}</label>
                <select
                  className="rk-select"
                  value={playerAId}
                  onChange={(e) => { setPlayerAId(e.target.value); setWinnerId(''); setLastResult(null); }}
                >
                  <option value="">{t('ranked.duelInfo.record.selectPlayer')}</option>
                  {allParticipants
                    .filter((p) => p.id !== playerBId)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.alias ? `${p.alias} (${p.name})` : p.name} — {p.eloPoints != null ? `${p.eloPoints} ${t('ranked.duelInfo.record.pts')}` : t('ranked.duelInfo.record.unranked')}
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

              <div className="rk-vs">{t('common.vs').toUpperCase()}</div>

              {/* Player B */}
              <div className="rk-player-slot">
                <label className="rk-slot-label">{t('ranked.duelInfo.record.player2')}</label>
                <select
                  className="rk-select"
                  value={playerBId}
                  onChange={(e) => { setPlayerBId(e.target.value); setWinnerId(''); setLastResult(null); }}
                >
                  <option value="">{t('ranked.duelInfo.record.selectPlayer')}</option>
                  {allParticipants
                    .filter((p) => p.id !== playerAId)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.alias ? `${p.alias} (${p.name})` : p.name} — {p.eloPoints != null ? `${p.eloPoints} ${t('ranked.duelInfo.record.pts')}` : t('ranked.duelInfo.record.unranked')}
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
                <p>{t('ranked.duelInfo.record.whoWon')}</p>
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
                {recording ? t('ranked.duelInfo.record.calculating') : t('ranked.duelInfo.record.confirmResult')}
              </button>
            </div>

            {/* Result feedback */}
            {lastResult && (
              <div className="rk-result-box">
                <h4>{t('ranked.duelInfo.record.resultRecorded')}</h4>
                <div className="rk-result-row">
                  <ResultCard r={lastResult.playerA} isWinner={lastResult.playerA.id === lastResult.match.winnerId} />
                  <span className="rk-result-vs">{t('ranked.duelInfo.record.vs')}</span>
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
  const { t } = useTranslation();
  const pts = participant.eloPoints;
  const rank = participant.eloRank;
  return (
    <div className={`rk-elo-preview ${isWinner ? 'winner-preview' : ''}`} onClick={onSetWinner}>
      <span className="rk-elo-rank-icon"><i className={getRankIcon(rank)} /></span>
      <div>
        <span className="rk-elo-rank-name" style={{ color: getRankColor(rank) }}>{rank}</span>
        <span className="rk-elo-pts">{pts != null ? `${pts.toLocaleString()} ${t('ranked.duelInfo.record.pts')}` : t('ranked.duelInfo.record.unranked')}</span>
      </div>
      {isWinner && <span className="rk-winner-crown"><i className="fas fa-crown" /> {t('ranked.duelInfo.record.winnerLabel')}</span>}
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
  const { t } = useTranslation();
  return (
    <div className={`rk-result-card ${isWinner ? 'winner' : 'loser'}`}>
      <span className="rk-result-name">{isWinner ? <i className="fas fa-crown" /> : ''} {r.name}</span>
      <span className="rk-result-pts">
        {r.pointsBefore} → <strong>{r.pointsAfter}</strong>
      </span>
      <span className={`rk-result-delta ${r.delta >= 0 ? 'positive' : 'negative'}`}>
        {r.delta >= 0 ? '+' : ''}{r.delta} {t('ranked.duelInfo.record.pts')}
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
