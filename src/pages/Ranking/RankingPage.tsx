import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalParticipant } from '@/models/types';
import { getAllParticipantsAsync, getAllParticipants } from '@/services/participants/participantService';
import {
  getLeaderboard,
  getAllMatches,
  deleteMatch,
  hardResetRanking,
  softResetRanking,
  getRankColor,
  getRankIcon,
  type LeaderboardEntry,
} from '@/services/ranking/rankingService';
import type { MatchRecord } from '@/models/types';

import { useCommunity } from '@/contexts/CommunityContext';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import PlayerDropdown from '@/components/PlayerDropdown/PlayerDropdown';
import RankingInfo from './RankingInfo';
import Loading from '@/components/Loading/Loading';
import './RankingPage.css';

type Tab = 'leaderboard' | 'history' | 'info';

function RankingPage() {
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminCurrentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;
  const [tab, setTab] = useState<Tab>('leaderboard');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState('');

  // All participants (for selectors)
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);

  // History
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

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
      const data = await getLeaderboard(communityId);
      setLeaderboard(data);
    } catch {
      setBoardError('Could not load the ranking. Is the server running?');
    } finally {
      setLoadingBoard(false);
    }
  }, [communityId]);

  const loadHistory = useCallback(async () => {
    if (!communityId) return;
    setLoadingHistory(true);
    try {
      const data = await getAllMatches(communityId);
      setMatchHistory(data as unknown as MatchRecord[]);
    } catch {
      // silently fail
    } finally {
      setLoadingHistory(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (!communityId) return;
    // Load participants for selectors — cached first, then server (filtered by community)
    const cached = getAllParticipants(communityId);
    if (cached.length) setAllParticipants(cached);
    getAllParticipantsAsync(communityId).then((data) => { if (data.length) setAllParticipants(data); });

    loadLeaderboard();
  }, [loadLeaderboard, communityId]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);



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
      await softResetRanking(communityId);
      await loadLeaderboard();
      if (tab === 'history') await loadHistory();
    } catch { /* silently fail */ }
    finally { setResetting(false); }
  }

  async function handleHardReset() {
    setShowHardConfirm2(false);
    setResetting(true);
    try {
      await hardResetRanking(communityId);
      await loadLeaderboard();
      if (tab === 'history') {
        await loadHistory();
      } else {
        setMatchHistory([]);
      }
    } catch { /* silently fail */ }
    finally { setResetting(false); }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function pName(id: string) {
    const p = participantMap.get(id);
    return p ? (p.alias ? `${p.alias} (${p.name})` : p.name) : id;
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
          {canAdminCurrentCommunity && (
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
          )}
          <div className="rk-tabs">
            <button className={`rk-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
              <i className="fas fa-trophy" /> Ranking
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
          {loadingBoard && <Loading message="Loading ranking..." />}
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
              <button className="btn btn-primary" onClick={() => navigate(getPath('participants'))}>
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
                      className={`rk-row ${entry.position != null && entry.position <= 5 ? 'legend-row' : ''}`}
                      onClick={() => navigate(getPath(`participants/${entry.id}`))}
                    >
                      <td className="rk-col-pos">
                        <span className={`rk-pos ${entry.position != null && entry.position <= 3 ? `top${entry.position}` : ''}`}>
                          {entry.position != null
                            ? (entry.position <= 3 ? ['🥇', '🥈', '🥉'][entry.position - 1] : entry.position)
                            : '—'}
                        </span>
                      </td>
                      <td className="rk-col-player">
                        <div className="rk-player">
                          {entry.avatarUrl
                            ? <img src={entry.avatarUrl} alt={entry.alias ? `${entry.alias} (${entry.name})` : entry.name} className="rk-avatar" />
                            : <div className="rk-avatar-placeholder">{(entry.alias || entry.name)[0]?.toUpperCase()}</div>
                          }
                          <div className="rk-player-info">
                            <span className="rk-player-name">{entry.alias ? `${entry.alias} (${entry.name})` : entry.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="rk-col-rank">
                        <div className="rk-rank-badges">
                          {entry.position != null && entry.position <= 5 && (
                            <span className="rk-legend-badge">
                              <i className="fas fa-dragon" />
                              {' '}LEGEND
                            </span>
                          )}
                          <span
                            className="rk-rank-badge"
                            style={{ '--rank-color': getRankColor(entry.eloRank) } as React.CSSProperties}
                          >
                            <i className={getRankIcon(entry.eloRank)} />
                            {' '}{entry.eloRank}
                          </span>
                        </div>
                      </td>
                      <td className="rk-col-pts">
                        <span className="rk-pts">
                          {entry.eloPoints != null ? entry.eloPoints.toLocaleString() : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}



      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="rk-section">
          <div className="rk-history-header">
            <PlayerDropdown
              participants={allParticipants}
              selectedId={selectedPlayerId}
              onSelect={setSelectedPlayerId}
              placeholder="All Players"
            />
          </div>

          {loadingHistory && <Loading message="Loading history..." />}

          {!loadingHistory && matchHistory.filter(m => !selectedPlayerId || m.playerAId === selectedPlayerId || m.playerBId === selectedPlayerId).length === 0 && (
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
              })[])
                .filter(m => !selectedPlayerId || m.playerAId === selectedPlayerId || m.playerBId === selectedPlayerId)
                .map((m) => (
                <div key={m.id} className="card rk-history-card">
                  <div className="rk-history-top">
                    <span className="rk-history-date">{formatDate(m.createdAt)}</span>
                    {canAdminCurrentCommunity && (
                      <button
                        className="rk-history-delete"
                        title="Delete record (does not revert ELO)"
                        onClick={() => setDeleteTarget(m.id)}
                      >
                        🗑
                      </button>
                    )}
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



export default RankingPage;
