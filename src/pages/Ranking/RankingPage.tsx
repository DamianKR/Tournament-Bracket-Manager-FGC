import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlobalParticipant } from '@/models/types';
import { GAMES } from '@/data/games';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminCurrentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;

  function formatRank(rank: string | null | undefined) {
    if (!rank || rank === 'Sin puntos') return t('common.unranked');
    if (rank === 'Legend') return t('rankingInfo.rankLegend');
    return t(`rankingInfo.tierNames.${rank}`);
  }

  const [tab, setTab] = useState<Tab>('leaderboard');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState('');

  // All participants (for selectors)
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);

  // Game filter
  const [selectedGameId, setSelectedGameId] = useState<string>(GAMES[0]?.id ?? 'ssbu');

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
      const data = await getLeaderboard(communityId, selectedGameId);
      setLeaderboard(data);
    } catch {
      setBoardError(t('ranking.errorTitle'));
    } finally {
      setLoadingBoard(false);
    }
  }, [communityId, selectedGameId]);

  const loadHistory = useCallback(async () => {
    if (!communityId) return;
    setLoadingHistory(true);
    try {
      const data = await getAllMatches(communityId, selectedGameId);
      setMatchHistory(data as unknown as MatchRecord[]);
    } catch {
      // silently fail
    } finally {
      setLoadingHistory(false);
    }
  }, [communityId, selectedGameId]);

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
      await softResetRanking(communityId, selectedGameId);
      await loadLeaderboard();
      if (tab === 'history') await loadHistory();
    } catch { /* silently fail */ }
    finally { setResetting(false); }
  }

  async function handleHardReset() {
    setShowHardConfirm2(false);
    setResetting(true);
    try {
      await hardResetRanking(communityId, selectedGameId);
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
          <h1 className="rk-title">{t('ranking.title')}</h1>
          <p className="rk-subtitle">{t('ranking.subtitle')}</p>
        </div>
        <div className="rk-header-right">
          {canAdminCurrentCommunity && (
            <div className="rk-reset-btns">
              <button
                className="rk-reset-btn soft"
                onClick={() => setShowSoftConfirm(true)}
                disabled={resetting}
                title={t('ranking.softResetTooltip')}
              >
                <i className="fas fa-rotate-left" /> {t('ranking.softReset')}
              </button>
              <button
                className="rk-reset-btn hard"
                onClick={() => setShowHardConfirm1(true)}
                disabled={resetting}
                title={t('ranking.hardResetTooltip')}
              >
                <i className="fas fa-triangle-exclamation" /> {t('ranking.hardReset')}
              </button>
            </div>
          )}
          <div className="rk-game-filter">
            <label htmlFor="rk-game-select">{t('ranking.gameLabel')}</label>
            <select
              id="rk-game-select"
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
            >
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="rk-tabs">
            <button className={`rk-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
              <i className="fas fa-trophy" /> {t('ranking.tabs.ranking')}
            </button>
            <button className={`rk-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
              <i className="fas fa-list" /> {t('ranking.tabs.history')}
            </button>
            <button className={`rk-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
              <i className="fas fa-info-circle" /> {t('ranking.tabs.info')}
            </button>
          </div>
        </div>{/* rk-header-right */}
      </div>{/* rk-header */}

      {/* ── LEADERBOARD TAB ── */}
      {tab === 'leaderboard' && (
        <div className="rk-section">
          {loadingBoard && <Loading message={t('ranking.loadingRanking')} />}
          {boardError && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-triangle-exclamation" /></span>
              <p style={{ color: 'var(--danger-color, #ef4444)', fontWeight: 600 }}>
                {t('ranking.errorTitle')}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {t('ranking.errorDesc')}<br />
                {t('ranking.errorDesc2')}
              </p>
              <button className="btn btn-primary" onClick={() => void loadLeaderboard()}>
                {t('ranking.retry')}
              </button>
            </div>
          )}

          {!loadingBoard && !boardError && leaderboard.length === 0 && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-trophy" /></span>
              <p>{t('ranking.emptyNoParticipants')}</p>
              <button className="btn btn-primary" onClick={() => navigate(getPath('participants'))}>
                {t('ranking.goToParticipants')}
              </button>
            </div>
          )}

          {!loadingBoard && leaderboard.length > 0 && (
            <div className="rk-table-wrapper card">
              <table className="rk-table">
                <thead>
                  <tr>
                    <th className="rk-col-pos">{t('ranking.colPos')}</th>
                    <th className="rk-col-player">{t('ranking.colPlayer')}</th>
                    <th className="rk-col-rank">{t('ranking.colRank')}</th>
                    <th className="rk-col-pts">{t('ranking.colPoints')}</th>
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
                              {' '}{t('ranking.legend')}
                            </span>
                          )}
                          <span
                            className="rk-rank-badge"
                            style={{ '--rank-color': getRankColor(entry.eloRank) } as React.CSSProperties}
                          >
                            <i className={getRankIcon(entry.eloRank)} />
                            {' '}{formatRank(entry.eloRank)}
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
              placeholder={t('ranking.allPlayers')}
            />
          </div>

          {loadingHistory && <Loading message={t('ranking.loadingHistory')} />}

          {!loadingHistory && matchHistory.filter(m => !selectedPlayerId || m.playerAId === selectedPlayerId || m.playerBId === selectedPlayerId).length === 0 && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-list" /></span>
              <p>{t('ranking.emptyNoMatches')}</p>
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
                        title={t('ranking.deleteRecordTitle')}
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
                    <span className="rk-history-vs">{t('ranking.vs')}</span>
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
        title={t('ranking.deleteRecordTitle')}
        message={t('ranking.deleteRecordMessage')}
        confirmText={t('ranking.delete')}
        onConfirm={() => { void handleDeleteMatch(); }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Soft reset — single confirmation */}
      <ConfirmModal
        isOpen={showSoftConfirm}
        title={t('ranking.softResetConfirmTitle')}
        message={t('ranking.softResetConfirmMessage')}
        confirmText={t('ranking.applySoftReset')}
        onConfirm={() => { void handleSoftReset(); }}
        onCancel={() => setShowSoftConfirm(false)}
      />

      {/* Hard reset — step 1 */}
      <ConfirmModal
        isOpen={showHardConfirm1}
        title={t('ranking.hardResetConfirmTitle1')}
        message={t('ranking.hardResetConfirmMessage1')}
        confirmText={t('ranking.continue')}
        onConfirm={() => { setShowHardConfirm1(false); setShowHardConfirm2(true); }}
        onCancel={() => setShowHardConfirm1(false)}
      />

      {/* Hard reset — step 2 */}
      <ConfirmModal
        isOpen={showHardConfirm2}
        title={t('ranking.hardResetConfirmTitle2')}
        message={t('ranking.hardResetConfirmMessage2')}
        confirmText={t('ranking.yesHardReset')}
        onConfirm={() => { void handleHardReset(); }}
        onCancel={() => setShowHardConfirm2(false)}
      />
      </div>
    </div>
  );
}



export default RankingPage;
