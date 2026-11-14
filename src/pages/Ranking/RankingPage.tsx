import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlobalParticipant } from '@/models/types';
import { GAMES } from '@/data/games';
import { gameBadgeStyle } from '@/utils/gameColor';
import OfflineNotice from '@/components/OfflineNotice/OfflineNotice';
import { getAllParticipantsAsync, getAllParticipants } from '@/services/participants/participantService';
import {
  createLeaderboardSource,
  LEADERBOARD_SPEC,
  clearLeaderboard,
  createRankedHistorySource,
  buildRankedHistorySpec,
  forgetRankedMatch,
  clearRankedHistory,
  deleteMatch,
  hardResetRanking,
  softResetRanking,
  getRankColor,
  getRankIcon,
} from '@/services/ranking/rankingService';
import Pagination from '@/components/Pagination/Pagination';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { charsWithColorsFromGames } from '@/utils/matchData';
import CharacterIcons from '@/components/CharacterIcons/CharacterIcons';
import PlayerDisplay from '@/components/PlayerDisplay/PlayerDisplay';

import { useCommunity } from '@/contexts/CommunityContext';
import ResetAvailabilityButton from '@/components/ResetAvailabilityButton/ResetAvailabilityButton';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import PlayerDropdown from '@/components/PlayerDropdown/PlayerDropdown';
import RankingInfo from './RankingInfo';
import Loading from '@/components/Loading/Loading';
import './RankingPage.css';

type Tab = 'leaderboard' | 'history' | 'info';

function RankingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminGame, communityGames, isFeatureEnabled } = useCommunity();
  const communityId = currentCommunity?.id;

  // Ranked apagado por completo (duels + matchmaking) → el tab History desaparece
  const rankedHistoryEnabled = isFeatureEnabled('duels') || isFeatureEnabled('matchmaking');

  function formatRank(rank: string | null | undefined) {
    if (!rank || rank === 'Sin puntos') return t('common.unranked');
    if (rank === 'Legend') return t('rankingInfo.rankLegend');
    return t(`rankingInfo.tierNames.${rank}`);
  }

  // Badge de tipo de match en el historial (duel / matchmaking / free)
  function historyTypeBadge(type: string | undefined) {
    const mt = type === 'duel' ? 'duel' : type === 'matchmaking' ? 'matchmaking' : 'free';
    const icon = mt === 'duel' ? 'fa-khanda' : mt === 'matchmaking' ? 'fa-random' : 'fa-star';
    const color = mt === 'duel' ? '#8b5cf6' : mt === 'matchmaking' ? '#22c55e' : '#94a3b8';
    const label = mt === 'duel' ? t('history.duels')
      : mt === 'matchmaking' ? t('history.matchmaking')
      : t('participantProfile.matches.matchTypes.free', { defaultValue: 'Ranked' });
    return (
      <span className="rk-history-type" style={{ color, borderColor: color }}>
        <i className={`fas ${icon}`} /> {label}
      </span>
    );
  }

  const [tab, setTab] = useState<Tab>('leaderboard');

  // All participants (for selectors)
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);

  // Game filter
  const [selectedGameId, setSelectedGameId] = useState<string>(GAMES[0]?.id ?? 'ssbu');

  // Si la comunidad deshabilita el juego seleccionado → saltar al primero habilitado
  useEffect(() => {
    if (selectedGameId !== 'all' && communityGames.length > 0 && !communityGames.some((g) => g.id === selectedGameId)) {
      setSelectedGameId(communityGames[0].id);
    }
  }, [communityGames]);
  // Resets aplican al juego seleccionado — un admin de juegos solo puede resetear SUS juegos
  const canAdminSelectedGame = canAdminGame(selectedGameId === 'all' ? null : selectedGameId);

  // History — paginated: filters (game / player / enabled ranked types) run in
  // the server when online and on the local copy when offline.
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const historyTopRef = useRef<HTMLDivElement>(null);
  const duelsOn = isFeatureEnabled('duels');
  const matchmakingOn = isFeatureEnabled('matchmaking');
  const communityGameIds = communityGames.map((g) => g.id).join(',');

  const historySource = useMemo(
    () => (communityId && tab === 'history' && rankedHistoryEnabled ? createRankedHistorySource(communityId) : null),
    [communityId, tab, rankedHistoryEnabled]
  );
  const historySpec = useMemo(
    () => buildRankedHistorySpec({
      gameId: selectedGameId,
      communityGameIds: communityGameIds ? communityGameIds.split(',') : [],
      duelsOn,
      matchmakingOn,
      playerId: selectedPlayerId,
    }),
    [selectedGameId, communityGameIds, duelsOn, matchmakingOn, selectedPlayerId]
  );
  const history = usePaginatedList({ source: historySource, spec: historySpec });

  // Reset modals
  // Soft: single confirmation. Hard: two-step (first modal → second modal).
  const [showSoftConfirm, setShowSoftConfirm]       = useState(false);
  const [showHardConfirm1, setShowHardConfirm1]     = useState(false);
  const [showHardConfirm2, setShowHardConfirm2]     = useState(false);
  const [resetting, setResetting]                   = useState(false);

  // Participant name lookup
  const participantMap = new Map(allParticipants.map((p) => [p.id, p]));

  const gameIdForFetch = selectedGameId === 'all' ? GAMES[0]?.id : selectedGameId;

  // Leaderboard — paginated (default 50). Positions are global; the page is cut by the server.
  const boardTopRef = useRef<HTMLDivElement>(null);
  const leaderboardSource = useMemo(
    () => (communityId && tab === 'leaderboard' && gameIdForFetch ? createLeaderboardSource(communityId, gameIdForFetch) : null),
    [communityId, tab, gameIdForFetch]
  );
  const board = usePaginatedList({ source: leaderboardSource, spec: LEADERBOARD_SPEC, defaultPageSize: 50 });

  useEffect(() => {
    if (!communityId) return;
    // Load participants for selectors — cached first, then server (filtered by community)
    const cached = getAllParticipants(communityId);
    if (cached.length) setAllParticipants(cached);
    getAllParticipantsAsync(communityId).then((data) => { if (data.length) setAllParticipants(data); });
  }, [communityId]);

  useEffect(() => {
    if (tab === 'history' && !rankedHistoryEnabled) setTab('leaderboard');
  }, [tab, rankedHistoryEnabled]);

  // Both lists reload themselves on reconnect (usePaginatedList).



  // ── Delete match ────────────────────────────────────────────────────────

  async function handleDeleteMatch() {
    if (!deleteTarget) return;
    try {
      await deleteMatch(deleteTarget);
      if (communityId) forgetRankedMatch(communityId, deleteTarget);
      history.reload();
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
      if (communityId && gameIdForFetch) clearLeaderboard(communityId, gameIdForFetch);
      board.reload();
      history.reload();
    } catch { /* silently fail */ }
    finally { setResetting(false); }
  }

  async function handleHardReset() {
    setShowHardConfirm2(false);
    setResetting(true);
    try {
      await hardResetRanking(communityId, selectedGameId);
      if (communityId && gameIdForFetch) clearLeaderboard(communityId, gameIdForFetch);
      board.reload();
      if (communityId) clearRankedHistory(communityId);   // the wiped history must not survive offline
      history.reload();
    } catch { /* silently fail */ }
    finally { setResetting(false); }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function pDisplay(id: string) {
    const p = participantMap.get(id);
    return <PlayerDisplay name={p?.name ?? id} alias={p?.alias} size="sm" />;
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
          {canAdminSelectedGame && (
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
              <ResetAvailabilityButton />
            </div>
          )}
          <div className="rk-game-filter">
            <label htmlFor="rk-game-select">{t('ranking.gameLabel')}</label>
            <select
              id="rk-game-select"
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              style={{ color: GAMES.find(g => g.id === selectedGameId)?.color, fontWeight: 700 }}
            >
              {tab === 'history' && (
                <option value="all" style={{ color: 'var(--primary-color)', fontWeight: 700 }}>
                  {t('ranking.allGames', { defaultValue: 'All games' })}
                </option>
              )}
              {communityGames.map((g) => (
                <option key={g.id} value={g.id} style={{ color: g.color, fontWeight: 700 }}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="rk-tabs">
            <button className={`rk-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => { setTab('leaderboard'); if (selectedGameId === 'all' || !communityGames.some((g) => g.id === selectedGameId)) setSelectedGameId(communityGames[0]?.id ?? 'ssbu'); }}>
              <i className="fas fa-trophy" /> {t('ranking.tabs.ranking')}
            </button>
            {rankedHistoryEnabled && (
              <button className={`rk-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
                <i className="fas fa-list" /> {t('ranking.tabs.history')}
              </button>
            )}
            <button className={`rk-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>
              <i className="fas fa-info-circle" /> {t('ranking.tabs.info')}
            </button>
          </div>
        </div>{/* rk-header-right */}
      </div>{/* rk-header */}

      {/* ── LEADERBOARD TAB ── */}
      {tab === 'leaderboard' && (
        <div className="rk-section">
          <div ref={boardTopRef} />
          {board.loading && <Loading message={t('ranking.loadingRanking')} />}
          {board.from === 'local' && board.cachedAt && !board.incomplete && (
            <div className="rk-stale-banner">
              <i className="fas fa-plug-circle-xmark" />
              {' '}{t('ranking.offlineCache', { date: new Date(board.cachedAt).toLocaleString() })}
            </div>
          )}
          {board.unavailable && <OfflineNotice />}
          {board.incomplete && <OfflineNotice compact partial />}
          {board.error && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-triangle-exclamation" /></span>
              <p style={{ color: 'var(--danger-color, #ef4444)', fontWeight: 600 }}>
                {t('ranking.errorTitle')}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {t('ranking.errorDesc')}<br />
                {t('ranking.errorDesc2')}
              </p>
              <button className="btn btn-primary" onClick={board.reload}>
                {t('ranking.retry')}
              </button>
            </div>
          )}

          {!board.loading && !board.unavailable && !board.error && board.total === 0 && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-trophy" /></span>
              <p>{t('ranking.emptyNoParticipants')}</p>
              <button className="btn btn-primary" onClick={() => navigate(getPath('participants'))}>
                {t('ranking.goToParticipants')}
              </button>
            </div>
          )}

          {board.items.length > 0 && (
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
                  {board.items.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`rk-row ${entry.position != null && entry.position <= 5 ? 'legend-row' : ''}`}
                      onClick={() => navigate(getPath(`participants/${entry.id}${selectedGameId && selectedGameId !== 'all' ? `?game=${selectedGameId}` : ''}`))}
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
                            <PlayerDisplay name={entry.name} alias={entry.alias} size="sm" />
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

          <Pagination {...board.paginationProps} scrollRef={boardTopRef} />
        </div>
      )}



      {/* ── HISTORY TAB ── */}
      {tab === 'history' && rankedHistoryEnabled && (
        <div className="rk-section">
          <div className="rk-history-header">
            <PlayerDropdown
              participants={allParticipants}
              selectedId={selectedPlayerId}
              onSelect={setSelectedPlayerId}
              placeholder={t('ranking.allPlayers')}
            />
          </div>

          <div ref={historyTopRef} />
          {history.loading && <Loading message={t('ranking.loadingHistory')} />}
          {history.unavailable && <OfflineNotice />}
          {history.incomplete && <OfflineNotice compact partial />}

          {history.error && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-triangle-exclamation" /></span>
              <p style={{ color: 'var(--danger-color, #ef4444)', fontWeight: 600 }}>{t('ranking.errorTitle')}</p>
              <button className="btn btn-primary" onClick={history.reload}>{t('ranking.retry')}</button>
            </div>
          )}

          {!history.loading && !history.unavailable && !history.error && history.total === 0 && (
            <div className="rk-empty">
              <span className="rk-empty-icon"><i className="fas fa-list" /></span>
              <p>{t('ranking.emptyNoMatches')}</p>
            </div>
          )}

          {history.items.length > 0 && (
            <div className="rk-history-list">
              {history.items
                .map((m) => (
                <div key={m.id} className="card rk-history-card">
                  <div className="rk-history-top">
                    {m.gameId && (
                      <span className="rk-history-game" style={gameBadgeStyle(m.gameId)}>
                        {m.gameId.toUpperCase()}
                      </span>
                    )}
                    {historyTypeBadge(m.type)}
                    <span className="rk-history-date">{formatDate(m.createdAt)}</span>
                    {canAdminGame(m.gameId) && (
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
                        <CharacterIcons
                          gameId={m.gameId}
                          characterIds={m.player1Characters?.length ? m.player1Characters : charsWithColorsFromGames(m.games, 1)}
                        />
                        {m.winnerId === m.playerAId ? <i className="fas fa-crown" /> : ''} {pDisplay(m.playerAId)}
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
                    <span className="rk-history-vs">
                      {m.player1Score !== null && m.player1Score !== undefined && m.player2Score !== null && m.player2Score !== undefined ? (
                        <span className="rk-history-score">
                          <span className={m.player1Score > m.player2Score ? 'ms-win' : 'ms-loss'}>{m.player1Score}</span>
                          <em>–</em>
                          <span className={m.player2Score > m.player1Score ? 'ms-win' : 'ms-loss'}>{m.player2Score}</span>
                        </span>
                      ) : t('ranking.vs')}
                    </span>
                    <div className={`rk-history-player ${m.winnerId === m.playerBId ? 'winner' : 'loser'}`}>
                      <span className="rk-history-pname">
                        <CharacterIcons
                          gameId={m.gameId}
                          characterIds={m.player2Characters?.length ? m.player2Characters : charsWithColorsFromGames(m.games, 2)}
                        />
                        {m.winnerId === m.playerBId ? <i className="fas fa-crown" /> : ''} {pDisplay(m.playerBId)}
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

          <Pagination {...history.paginationProps} scrollRef={historyTopRef} />
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
