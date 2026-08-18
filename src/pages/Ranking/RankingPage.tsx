import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalParticipant } from '@/models/types';
import { getAllParticipantsAsync, getAllParticipants } from '@/services/participants/participantService';
import {
  getLeaderboard,
  recordMatch,
  getAllMatches,
  deleteMatch,
  hardResetRanking,
  softResetRanking,
  getRankColor,
  getRankIcon,
  type LeaderboardEntry,
  type MatchResult,
} from '@/services/ranking/rankingService';
import type { MatchRecord } from '@/models/types';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import RankingInfo from './RankingInfo';
import './RankingPage.css';

type Tab = 'leaderboard' | 'record' | 'history' | 'info';

function RankingPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('leaderboard');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState('');

  // All participants (for selectors)
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);

  // Record match
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);

  // History
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Reset modals
  // Soft: single confirmation. Hard: two-step (first modal → second modal).
  const [showSoftConfirm, setShowSoftConfirm]       = useState(false);
  const [showHardConfirm1, setShowHardConfirm1]     = useState(false);
  const [showHardConfirm2, setShowHardConfirm2]     = useState(false);
  const [resetting, setResetting]                   = useState(false);

  // Participant name lookup
  const participantMap = new Map(allParticipants.map((p) => [p.id, p]));

  const loadLeaderboard = useCallback(async () => {
    setLoadingBoard(true);
    setBoardError('');
    try {
      const data = await getLeaderboard();
      setLeaderboard(data);
    } catch {
      setBoardError('Could not load the ranking. Is the server running?');
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await getAllMatches();
      setMatchHistory(data as unknown as MatchRecord[]);
    } catch {
      // silently fail
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    // Load participants for selectors — cached first, then server
    const cached = getAllParticipants();
    if (cached.length) setAllParticipants(cached);
    getAllParticipantsAsync().then((data) => { if (data.length) setAllParticipants(data); });

    loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // ── Record match ────────────────────────────────────────────────────────

  async function handleRecord() {
    if (!playerAId || !playerBId) { setRecordError('Select both participants.'); return; }
    if (playerAId === playerBId) { setRecordError('A participant cannot face itself.'); return; }
    if (!winnerId) { setRecordError('Select who won.'); return; }

    setRecording(true);
    setRecordError('');
    setLastResult(null);
    try {
      const result = await recordMatch(playerAId, playerBId, winnerId);
      setLastResult(result);

      // Patch the local participants list with the updated ELO values so the
      // dropdowns reflect the new points immediately without a page refresh.
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

      // Refresh leaderboard
      await loadLeaderboard();
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

  // ── Delete match ────────────────────────────────────────────────────────

  async function handleDeleteMatch() {
    if (!deleteTarget) return;
    try {
      await deleteMatch(deleteTarget);
      setMatchHistory((prev) => prev.filter((m) => m.id !== deleteTarget));
    } catch {
      // silently fail
    } finally {
      setDeleteTarget(null);
    }
  }

  // ── Reset handlers ────────────────────────────────────────────────────────

  async function handleSoftReset() {
    setShowSoftConfirm(false);
    setResetting(true);
    try {
      await softResetRanking();
      await loadLeaderboard();
      if (tab === 'history') await loadHistory();
    } catch { /* silently fail */ }
    finally { setResetting(false); }
  }

  async function handleHardReset() {
    setShowHardConfirm2(false);
    setResetting(true);
    try {
      await hardResetRanking();
      await loadLeaderboard();
      setMatchHistory([]);
    } catch { /* silently fail */ }
    finally { setResetting(false); }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function pName(id: string) {
    return participantMap.get(id)?.name ?? id;
  }

  function deltaLabel(delta: number) {
    if (delta > 0) return <span className="rk-delta positive">+{delta}</span>;
    if (delta < 0) return <span className="rk-delta negative">{delta}</span>;
    return <span className="rk-delta neutral">0</span>;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="ranking-page">
      <div className="container">
        <div className="rk-header">
        <div>
          <h1 className="rk-title">Ranking ELO</h1>
          <p className="rk-subtitle">Competitive scoring system — start at 1500 pts</p>
        </div>
        <div className="rk-header-right">
          <div className="rk-reset-btns">
            <button
              className="rk-reset-btn soft"
              onClick={() => setShowSoftConfirm(true)}
              disabled={resetting}
              title="Returns each player to the start of their current tier"
            >
              <i className="fas fa-rotate-left" /> Soft Reset
            </button>
            <button
              className="rk-reset-btn hard"
              onClick={() => setShowHardConfirm1(true)}
              disabled={resetting}
              title="Returns all players to 1500 pts and clears history"
            >
              <i className="fas fa-triangle-exclamation" /> Hard Reset
            </button>
          </div>
          <div className="rk-tabs">
            <button className={`rk-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
              <i className="fas fa-trophy" /> Ranking
            </button>
            <button className={`rk-tab ${tab === 'record' ? 'active' : ''}`} onClick={() => setTab('record')}>
              <i className="fas fa-gamepad" /> Record Match
            </button>
            <button className={`rk-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
              <i className="fas fa-list" /> History
            </button>
            <button className={`rk-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
              <i className="fas fa-info-circle" /> Info
            </button>
          </div>
        </div>{/* rk-header-right */}
      </div>{/* rk-header */}

      {/* ── LEADERBOARD TAB ── */}
      {tab === 'leaderboard' && (
        <div className="rk-section">
          {loadingBoard && <p className="rk-loading">Loading ranking...</p>}
          {boardError && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-triangle-exclamation" /></span>
              <p style={{ color: 'var(--danger-color, #ef4444)', fontWeight: 600 }}>
                Could not connect to the server.
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Make sure the API server is running on port 3001.<br />
                Use <code>npm run dev</code> or open <code>Abrir_Aplicacion.bat</code>.
              </p>
              <button className="btn btn-primary" onClick={() => void loadLeaderboard()}>
                Retry
              </button>
            </div>
          )}

          {!loadingBoard && !boardError && leaderboard.length === 0 && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-trophy" /></span>
              <p>No participants yet.</p>
              <button className="btn btn-primary" onClick={() => navigate('/participants')}>
                Go to Participants
              </button>
            </div>
          )}

          {!loadingBoard && leaderboard.length > 0 && (
            <div className="rk-table-wrapper card">
              <table className="rk-table">
                <thead>
                  <tr>
                    <th className="rk-col-pos">#</th>
                    <th className="rk-col-player">Player</th>
                    <th className="rk-col-rank">Rank</th>
                    <th className="rk-col-pts">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`rk-row ${entry.position <= 5 ? 'legend-row' : ''}`}
                      onClick={() => navigate(`/participants/${entry.id}`)}
                    >
                      <td className="rk-col-pos">
                        <span className={`rk-pos ${entry.position <= 3 ? `top${entry.position}` : ''}`}>
                          {entry.position <= 3 ? ['🥇', '🥈', '🥉'][entry.position - 1] : entry.position}
                        </span>
                      </td>
                      <td className="rk-col-player">
                        <div className="rk-player">
                          {entry.avatarUrl
                            ? <img src={entry.avatarUrl} alt={entry.name} className="rk-avatar" />
                            : <div className="rk-avatar-placeholder">{entry.name[0]?.toUpperCase()}</div>
                          }
                          <div className="rk-player-info">
                            <span className="rk-player-name">{entry.name}</span>
                            {entry.alias && <span className="rk-player-alias">{entry.alias}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="rk-col-rank">
                        <span
                          className={`rk-rank-badge ${entry.displayRank === 'Legend' ? 'rk-rank-badge--legend' : ''}`}
                          style={{ '--rank-color': getRankColor(entry.displayRank) } as React.CSSProperties}
                        >
                          <i className={entry.displayRank === 'Legend' ? 'fas fa-dragon' : getRankIcon(entry.displayRank)} />
                          {' '}{entry.displayRank}
                        </span>
                      </td>
                      <td className="rk-col-pts">
                        <span className="rk-pts">{entry.eloPoints.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RECORD MATCH TAB ── */}
      {tab === 'record' && (
        <div className="rk-section">
          <div className="card rk-record-card">
            <div className="rk-record-header">
              <span className="rk-record-icon"><i className="fas fa-gamepad" /></span>
              <div>
                <h3>Record Match</h3>
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
                            {p.name}{p.alias ? ` (${p.alias})` : ''} — {p.eloPoints ?? 1500} pts
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
                            {p.name}{p.alias ? ` (${p.alias})` : ''} — {p.eloPoints ?? 1500} pts
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
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="rk-section">
          {loadingHistory && <p className="rk-loading">Loading history...</p>}

          {!loadingHistory && matchHistory.length === 0 && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-list" /></span>
              <p>No matches recorded yet.</p>
            </div>
          )}

          {!loadingHistory && matchHistory.length > 0 && (
            <div className="rk-history-list">
              {(matchHistory as unknown as (MatchRecord & {
                playerAPointsBefore: number; playerBPointsBefore: number;
                playerAPointsAfter: number; playerBPointsAfter: number;
                playerADelta: number; playerBDelta: number;
                playerARankBefore: string; playerBRankBefore: string;
                playerARankAfter: string; playerBRankAfter: string;
              })[]).map((m) => (
                <div key={m.id} className="card rk-history-card">
                  <div className="rk-history-top">
                    <span className="rk-history-date">{formatDate(m.createdAt)}</span>
                    <button
                      className="rk-history-delete"
                      title="Delete record (does not revert ELO)"
                      onClick={() => setDeleteTarget(m.id)}
                    >
                      🗑
                    </button>
                  </div>
                  <div className="rk-history-players">
                    <div className={`rk-history-player ${m.winnerId === m.playerAId ? 'winner' : 'loser'}`}>
                      <span className="rk-history-pname">
                        {m.winnerId === m.playerAId ? <i className="fas fa-crown" /> : ''} {pName(m.playerAId)}
                      </span>
                      <span className="rk-history-pts">
                        {m.playerAPointsBefore} → {m.playerAPointsAfter} {deltaLabel(m.playerADelta)}
                      </span>
                      <span className="rk-history-rank">
                        {m.playerARankBefore !== m.playerARankAfter
                          ? `${m.playerARankBefore} → ${m.playerARankAfter}`
                          : m.playerARankAfter}
                      </span>
                    </div>
                    <span className="rk-history-vs">vs</span>
                    <div className={`rk-history-player ${m.winnerId === m.playerBId ? 'winner' : 'loser'}`}>
                      <span className="rk-history-pname">
                        {m.winnerId === m.playerBId ? <i className="fas fa-crown" /> : ''} {pName(m.playerBId)}
                      </span>
                      <span className="rk-history-pts">
                        {m.playerBPointsBefore} → {m.playerBPointsAfter} {deltaLabel(m.playerBDelta)}
                      </span>
                      <span className="rk-history-rank">
                        {m.playerBRankBefore !== m.playerBRankAfter
                          ? `${m.playerBRankBefore} → ${m.playerBRankAfter}`
                          : m.playerBRankAfter}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── INFO TAB ── */}
      {tab === 'info' && (
        <div className="rk-section">
          <RankingInfo />
        </div>
      )}

      {/* Delete match confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete record"
        message="Delete this match record? This action does not revert the applied ELO points."
        confirmText="Delete"
        onConfirm={() => { void handleDeleteMatch(); }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Soft reset — single confirmation */}
      <ConfirmModal
        isOpen={showSoftConfirm}
        title="Soft Reset"
        message="This will return each player to the start of their current tier (e.g., 1699 → 1600). The match history will be preserved. Confirm?"
        confirmText="Apply Soft Reset"
        onConfirm={() => { void handleSoftReset(); }}
        onCancel={() => setShowSoftConfirm(false)}
      />

      {/* Hard reset — step 1 */}
      <ConfirmModal
        isOpen={showHardConfirm1}
        title="Hard Reset — Confirmation 1/2"
        message="This will return ALL players to 1500 pts (Diamante) and clear all match history. This action is irreversible."
        confirmText="Continue →"
        onConfirm={() => { setShowHardConfirm1(false); setShowHardConfirm2(true); }}
        onCancel={() => setShowHardConfirm1(false)}
      />

      {/* Hard reset — step 2 */}
      <ConfirmModal
        isOpen={showHardConfirm2}
        title="Hard Reset — Confirmation 2/2"
        message="Are you COMPLETELY sure? All points and match history will be lost with no possibility of recovery."
        confirmText="Yes, perform Hard Reset"
        onConfirm={() => { void handleHardReset(); }}
        onCancel={() => setShowHardConfirm2(false)}
      />
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
  const pts = participant.eloPoints ?? 1500;
  const rank = participant.eloRank ?? 'Diamante';
  return (
    <div className={`rk-elo-preview ${isWinner ? 'winner-preview' : ''}`} onClick={onSetWinner}>
      <span className="rk-elo-rank-icon"><i className={getRankIcon(rank)} /></span>
      <div>
        <span className="rk-elo-rank-name" style={{ color: getRankColor(rank) }}>{rank}</span>
        <span className="rk-elo-pts">{pts.toLocaleString()} pts</span>
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

export default RankingPage;
