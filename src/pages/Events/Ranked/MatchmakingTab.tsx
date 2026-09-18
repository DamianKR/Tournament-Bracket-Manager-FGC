import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GAMES } from '@/data/games';
import { useCommunity } from '@/contexts/CommunityContext';
import { getAllParticipantsAsync } from '@/services/participants/participantService';
import { recordMatch } from '@/services/ranking/rankingService';
import { GlobalParticipant } from '@/models/types';
import { getRankIcon } from '@/utils/rank';
import { gameBadgeStyle } from '@/utils/gameColor';
import {
  MatchmakingSeason,
  MatchmakingAssignment,
  getSeasons,
  getSeasonDetail,
  deleteSeason,
  generateMatchmaking,
  advancePeriod,
  closeSeason,
  forfeitAssignment,
  cancelAssignment,
  resetAvailability,
  setSeasonParticipantRemoved,
} from '@/services/matchmaking/matchmakingService';
import './MatchmakingTab.css';

interface MatchmakingTabProps {
  onReportAssignment: (assignment: MatchmakingAssignment) => void;
}

function StatusBadge({ status }: { status: MatchmakingAssignment['status'] }) {
  const { t } = useTranslation();
  return <span className={`mm-status mm-status--${status}`}>{t(`ranked.mm.assignmentStatus.${status}`, { defaultValue: status })}</span>;
}

function SeasonBadge({ status }: { status: MatchmakingSeason['status'] }) {
  const { t } = useTranslation();
  return <span className={`mm-season-badge mm-season-badge--${status}`}>{t(`ranked.mm.seasonStatus.${status}`, { defaultValue: status })}</span>;
}

export default function MatchmakingTab({ onReportAssignment }: MatchmakingTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCommunity, canAdminCurrentCommunity, canAdminGame, myParticipantId, getPath } = useCommunity();
  const communityId = currentCommunity?.id ?? '';
  const isAdmin = canAdminCurrentCommunity;

  const [seasons, setSeasons]       = useState<MatchmakingSeason[]>([]);
  const [selected, setSelected]     = useState<MatchmakingSeason | null>(null);
  const [participants, setParticipants] = useState<GlobalParticipant[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [actionMsg, setActionMsg]   = useState('');

  // Reset availability modal
  const [showReset, setShowReset]   = useState(false);
  const [resetGameId, setResetGameId] = useState(GAMES[0]?.id ?? '');
  const [resetting, setResetting]   = useState(false);

  // Forfeit modal
  const [forfeitModal, setForfeitModal] = useState<{ assignment: MatchmakingAssignment; player: 'p1' | 'p2' } | null>(null);
  const [forfeitNote, setForfeitNote]   = useState('');
  const [forfeitLoading, setForfeitLoading] = useState(false);

  // Advance confirm modal
  const [showAdvance, setShowAdvance]   = useState(false);
  const [advancing, setAdvancing]       = useState(false);

  // Detail tabs + remove-participant modal
  const [detailTab, setDetailTab]       = useState<'matches' | 'players'>('matches');
  const [removeModal, setRemoveModal]   = useState<string | null>(null); // participantId
  const [removing, setRemoving]         = useState(false);


  const loadSeasons = useCallback(async () => {
    if (!communityId) return;
    setLoading(true); setError('');
    try {
      const [s, p] = await Promise.all([getSeasons(communityId), getAllParticipantsAsync()]);
      setSeasons(s.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setParticipants(p.filter((x) => x.communityId === communityId));
    } catch (e: any) {
      setError(e.message ?? 'Error');
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  const loadDetail = useCallback(async (seasonId: string) => {
    setLoading(true); setError('');
    try {
      const detail = await getSeasonDetail(seasonId);
      setSelected(detail);
    } catch (e: any) {
      setError(e.message ?? 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSeasons(); }, [loadSeasons]);

  const pMap  = new Map(participants.map((p) => [p.id, p]));
  const pName = (id: string) => { const p = pMap.get(id); return p ? (p.alias || p.name) : id; };
  const flash = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(''), 3500); };

  // ── Admin actions ──────────────────────────────────────────────────────────

  async function handleGenerate(seasonId: string) {
    setLoading(true); setError('');
    try {
      const result = await generateMatchmaking(seasonId);
      flash(t('ranked.mm.flash.generated', { matches: result.assignments.length, players: result.totalPlayers }));
      await loadDetail(seasonId);
      await loadSeasons();
    } catch (e: any) { setError(e.message); setLoading(false); }
  }

  async function handleAdvance() {
    if (!selected) return;
    setAdvancing(true); setError('');
    try {
      const result = await advancePeriod(selected.id);
      setShowAdvance(false);
      flash(t('ranked.mm.flash.advanced', { n: result.season.currentPeriod.index + 1, matches: result.assignments.length }));
      await loadDetail(selected.id);
      await loadSeasons();
    } catch (e: any) { setError(e.message); } finally { setAdvancing(false); }
  }

  async function handleClose(seasonId: string) {
    setLoading(true); setError('');
    try {
      const result = await closeSeason(seasonId);
      flash(t('ranked.mm.flash.closed', { count: result.closedAssignments }));
      await loadDetail(seasonId);
      await loadSeasons();
    } catch (e: any) { setError(e.message); setLoading(false); }
  }

  async function handleDelete(seasonId: string) {
    setLoading(true); setError('');
    try {
      await deleteSeason(seasonId);
      setSelected(null);
      flash(t('ranked.mm.flash.deleted'));
      await loadSeasons();
    } catch (e: any) { setError(e.message); setLoading(false); }
  }

  async function handleForfeit() {
    if (!forfeitModal) return;
    setForfeitLoading(true); setError('');
    const { assignment, player } = forfeitModal;
    const forfeitPlayerId = player === 'p1' ? assignment.player1Id : assignment.player2Id;
    const winnerId = forfeitPlayerId === assignment.player1Id ? assignment.player2Id : assignment.player1Id;
    try {
      // Apply ELO through the shared ranked-match endpoint (same as duels)
      const result = await recordMatch(
        assignment.player1Id,
        assignment.player2Id,
        winnerId,
        assignment.gameId,
        'matchmaking',
        communityId,
        undefined,
        undefined,
        undefined,
        { seasonId: assignment.seasonId, periodIndex: assignment.periodIndex }
      );
      await forfeitAssignment(assignment.id, forfeitPlayerId, forfeitNote || undefined, result.match.id);
      setForfeitModal(null); setForfeitNote('');
      flash(t('ranked.mm.flash.forfeit'));
      if (selected) await loadDetail(selected.id);
    } catch (e: any) { setError(e.message); } finally { setForfeitLoading(false); }
  }

  async function handleCancel(assignmentId: string) {
    setError('');
    try {
      await cancelAssignment(assignmentId, 'admin_cancelled');
      flash(t('ranked.mm.flash.cancelled'));
      if (selected) await loadDetail(selected.id);
    } catch (e: any) { setError(e.message); }
  }

  async function handleRemoveParticipant(participantId: string, removed: boolean) {
    if (!selected) return;
    setRemoving(true); setError('');
    try {
      const result = await setSeasonParticipantRemoved(selected.id, participantId, removed);
      setRemoveModal(null);
      const name = pName(participantId);
      flash(removed
        ? (result.cancelled > 0
            ? t('ranked.mm.flash.removed', { name, count: result.cancelled })
            : t('ranked.mm.flash.removedZero', { name }))
        : t('ranked.mm.flash.restored', { name }));
      await loadDetail(selected.id);
      await loadSeasons();
    } catch (e: any) { setError(e.message); } finally { setRemoving(false); }
  }

  async function handleResetAvailability() {
    if (!resetGameId) return;
    setResetting(true); setError('');
    try {
      const result = await resetAvailability(communityId, resetGameId);
      setShowReset(false);
      flash(t('ranked.mm.flash.reset', { count: result.updated }));
    } catch (e: any) { setError(e.message); } finally { setResetting(false); }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderAssignment(a: MatchmakingAssignment) {
    const p1     = pMap.get(a.player1Id);
    const p2     = pMap.get(a.player2Id);
    const p1Elo  = p1?.games?.[a.gameId]?.eloPoints;
    const p2Elo  = p2?.games?.[a.gameId]?.eloPoints;
    const p1Rank = p1?.games?.[a.gameId]?.eloRank ?? '';
    const p2Rank = p2?.games?.[a.gameId]?.eloRank ?? '';
    const isMine = myParticipantId === a.player1Id || myParticipantId === a.player2Id;
    const isGameAdmin = canAdminGame(a.gameId);
    const p1Won = a.status === 'completed' && a.winnerId === a.player1Id;
    const p2Won = a.status === 'completed' && a.winnerId === a.player2Id;

    return (
      <div key={a.id} className={`mm-assignment mm-assignment--${a.status}${isMine ? ' mm-assignment--mine' : ''}`}>
        <div className="mm-assignment-players">
          <div className={`mm-player${p1Won ? ' mm-player--winner' : ''}`}>
            {p1Won && <i className="fas fa-crown mm-win-icon" />}
            {p1Rank && <i className={`${getRankIcon(p1Rank)} mm-rank-icon`} title={p1Rank} />}
            <span className="mm-player-name">{pName(a.player1Id)}</span>
            {p1Elo != null && <span className="mm-elo">{p1Elo}</span>}
          </div>
          <span className="mm-vs">VS</span>
          <div className={`mm-player${p2Won ? ' mm-player--winner' : ''}`}>
            {p2Won && <i className="fas fa-crown mm-win-icon" />}
            {p2Rank && <i className={`${getRankIcon(p2Rank)} mm-rank-icon`} title={p2Rank} />}
            <span className="mm-player-name">{pName(a.player2Id)}</span>
            {p2Elo != null && <span className="mm-elo">{p2Elo}</span>}
          </div>
        </div>
        <div className="mm-assignment-actions">
          <StatusBadge status={a.status} />
          {a.status === 'pending' && (isMine || isGameAdmin) && (
            <button className="btn-primary btn-sm" onClick={() => onReportAssignment(a)}>
              <i className="fas fa-gamepad" /> {t('ranked.mm.report')}
            </button>
          )}
          {a.status === 'pending' && isGameAdmin && (
            <div className="mm-admin-icons">
              <button
                className="mm-icon-btn"
                onClick={() => setForfeitModal({ assignment: a, player: 'p1' })}
                title={t('ranked.mm.forfeitPlayer', { name: pName(a.player1Id) })}
              >
                <i className="fas fa-flag" /> {pName(a.player1Id)}
              </button>
              <button
                className="mm-icon-btn"
                onClick={() => setForfeitModal({ assignment: a, player: 'p2' })}
                title={t('ranked.mm.forfeitPlayer', { name: pName(a.player2Id) })}
              >
                <i className="fas fa-flag" /> {pName(a.player2Id)}
              </button>
              <button
                className="mm-icon-btn mm-icon-btn--danger"
                onClick={() => handleCancel(a.id)}
                title={t('ranked.mm.cancelNoPenalty')}
              >
                <i className="fas fa-ban" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────

  if (selected) {
    const game      = GAMES.find((g) => g.id === selected.gameId);
    const period    = selected.currentPeriod;
    const assignments   = selected.assignments ?? [];
    const myAssignments = assignments.filter((a) => myParticipantId === a.player1Id || myParticipantId === a.player2Id);
    const otherAssignments = isAdmin ? assignments.filter((a) => myParticipantId !== a.player1Id && myParticipantId !== a.player2Id) : [];
    const completedCount = assignments.filter((a) => a.status === 'completed').length;

    // Participant pools for the players tab
    const isSeasonAdmin = canAdminGame(selected.gameId);
    const removedSet    = new Set(selected.removedParticipants ?? []);
    const gameElo       = (p: (typeof participants)[number]) => p.games?.[selected.gameId]?.eloPoints ?? 0;
    const eligiblePool  = participants
      .filter((p) => p.games?.[selected.gameId] && p.games[selected.gameId].available !== false && !removedSet.has(p.id))
      .sort((a, b) => gameElo(b) - gameElo(a));
    const removedPool   = participants.filter((p) => removedSet.has(p.id));
    const inactiveCount = participants.filter((p) =>
      p.games?.[selected.gameId] && p.games[selected.gameId].available === false && !removedSet.has(p.id)
    ).length;
    const matchesCount  = (pid: string) =>
      assignments.filter((a) => a.player1Id === pid || a.player2Id === pid).length;

    // Days left in period
    const now = new Date();
    const daysLeft = period ? Math.max(0, Math.ceil((new Date(period.endDate).getTime() - now.getTime()) / 86400000)) : 0;
    const totalPeriodDays = selected.periodType === 'biweekly' ? 14 : 7;
    const progressPct = period ? Math.min(100, Math.max(0, 100 - (daysLeft / totalPeriodDays) * 100)) : 0;
    const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

    return (
      <div className="mm-detail">
        {/* Hero header */}
        <div className="mm-hero">
          <div className="mm-hero-top">
            <button className="mm-back-btn" onClick={() => setSelected(null)}>
              <i className="fas fa-arrow-left" /> {t('ranked.mm.backToSeasons')}
            </button>
            <div className="mm-hero-badges">
              <SeasonBadge status={selected.status} />
              {game && <span className="mm-game-badge" style={gameBadgeStyle(game.id)}>{game.shortName}</span>}
            </div>
          </div>
          <h1 className="mm-hero-title">{selected.name}</h1>
          <div className="mm-hero-stats">
            <div className="mm-stat">
              <span className="mm-stat-value">{selected.periodType === 'weekly' ? '7d' : '14d'}</span>
              <span className="mm-stat-label">{t('ranked.mm.frequency')}</span>
            </div>
            <div className="mm-stat">
              <span className="mm-stat-value">{selected.matchesPerPlayer}</span>
              <span className="mm-stat-label">{t('ranked.mm.matchesPerPlayerLabel')}</span>
            </div>
            <div className="mm-stat">
              <span className="mm-stat-value">{selected.gracePeriodDays}d</span>
              <span className="mm-stat-label">{t('ranked.mm.grace')}</span>
            </div>
            <div className="mm-stat">
              <span className="mm-stat-value">
                {selected.totalPeriods != null
                  ? `${(period?.index ?? 0) + 1}/${selected.totalPeriods}`
                  : `#${(period?.index ?? 0) + 1}`}
              </span>
              <span className="mm-stat-label">
                {selected.totalPeriods != null ? t('ranked.mm.periods') : t('ranked.mm.currentPeriod')}
              </span>
            </div>
            <div className="mm-stat">
              <span className="mm-stat-value">{completedCount}/{assignments.length}</span>
              <span className="mm-stat-label">{t('ranked.mm.played')}</span>
            </div>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {actionMsg && <div className="success-message">{actionMsg}</div>}

        {/* Period card */}
        {period && selected.status !== 'draft' && (
          <div className="mm-period-card">
            <div className="mm-period-card-head">
              <div className="mm-period-card-title">
                <i className="fas fa-calendar-week" />
                <span>{t('ranked.mm.period', { n: period.index + 1 })}</span>
                <span className={`mm-period-status-tag ${period.status}`}>
                  {period.status === 'active' && <><i className="fas fa-circle" /> {t('ranked.mm.inProgress')}</>}
                  {period.status === 'pending' && <><i className="fas fa-clock" /> {t('ranked.mm.notGenerated')}</>}
                  {period.status === 'skipped' && <><i className="fas fa-forward" /> {t('ranked.mm.skipped')}</>}
                </span>
              </div>
              <span className="mm-period-days-left">
                {period.status === 'active' && (daysLeft === 0 ? t('ranked.mm.lastDay') : t('ranked.mm.daysLeft', { count: daysLeft }))}
              </span>
            </div>
            <div className="mm-period-bar">
              <div className="mm-period-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mm-period-card-dates">
              <span><i className="fas fa-play" /> {fmtDate(period.startDate)}</span>
              <span><i className="fas fa-flag-checkered" /> {fmtDate(period.endDate)}</span>
            </div>
          </div>
        )}

        {/* Admin actions */}
        {isAdmin && (
          <div className="mm-admin-actions">
            {selected.status === 'draft' && (
              <>
                <button className="btn-primary" onClick={() => handleGenerate(selected.id)} disabled={loading}>
                  <i className="fas fa-shuffle" /> {t('ranked.mm.generatePeriod', { n: 1 })}
                </button>
                <button className="btn-danger" onClick={() => handleDelete(selected.id)} disabled={loading}>
                  <i className="fas fa-trash" /> {t('ranked.mm.deleteSeason')}
                </button>
              </>
            )}
            {selected.status === 'active' && (
              <>
                {(period?.status === 'pending' || period?.status === 'skipped') && (
                  <button className="btn-primary" onClick={() => handleGenerate(selected.id)} disabled={loading}>
                    <i className="fas fa-shuffle" /> {t('ranked.mm.generatePeriod', { n: (period?.index ?? 0) + 1 })}
                  </button>
                )}
                {period?.status === 'active' && (
                  <button className="btn-outline" onClick={() => setShowAdvance(true)} disabled={loading}>
                    <i className="fas fa-forward" /> {t('ranked.mm.advancePeriod')}
                  </button>
                )}
                <button className="btn-danger" onClick={() => handleClose(selected.id)} disabled={loading}>
                  <i className="fas fa-lock" /> {t('ranked.mm.closeSeason')}
                </button>
              </>
            )}
          </div>
        )}

        {/* Detail tabs */}
        <div className="mm-detail-tabs">
          <button
            className={`mm-detail-tab${detailTab === 'matches' ? ' active' : ''}`}
            onClick={() => setDetailTab('matches')}
          >
            <i className="fas fa-swords" /> {t('ranked.mm.tabs.matches')}
          </button>
          <button
            className={`mm-detail-tab${detailTab === 'players' ? ' active' : ''}`}
            onClick={() => setDetailTab('players')}
          >
            <i className="fas fa-users" /> {t('ranked.mm.tabs.players')}
            <span className="mm-detail-tab-count">{eligiblePool.length}</span>
          </button>
        </div>

        {/* Assignments */}
        {detailTab === 'matches' && myAssignments.length > 0 && (
          <section className="mm-section">
            <h3><i className="fas fa-user" /> {t('ranked.mm.myMatches')}</h3>
            {myAssignments.map(renderAssignment)}
          </section>
        )}
        {detailTab === 'matches' && isAdmin && otherAssignments.length > 0 && (
          <section className="mm-section">
            <h3><i className="fas fa-list" /> {t('ranked.mm.allPairings')}</h3>
            {otherAssignments.map(renderAssignment)}
          </section>
        )}
        {detailTab === 'matches' && !isAdmin && myAssignments.length === 0 && (
          <div className="mm-empty">{t('ranked.mm.notInPeriod')}</div>
        )}
        {detailTab === 'matches' && assignments.length === 0 && selected.status === 'active' && (
          <div className="mm-empty">{t('ranked.mm.periodNotGenerated')}</div>
        )}

        {/* Participants */}
        {detailTab === 'players' && (
          <section className="mm-section">
            <h3><i className="fas fa-users" /> {t('ranked.mm.players.active')} · {eligiblePool.length}</h3>
            {eligiblePool.length === 0 && (
              <div className="mm-empty">{t('ranked.mm.players.empty')}</div>
            )}
            {eligiblePool.map((p) => {
              const gp = p.games?.[selected.gameId];
              const count = matchesCount(p.id);
              return (
                <div key={p.id} className="mm-player-row">
                  <div className="mm-player-row-info">
                    {gp?.eloRank && <i className={`${getRankIcon(gp.eloRank)} mm-rank-icon`} title={gp.eloRank} />}
                    <span className="mm-player-name">{p.alias || p.name}</span>
                    {gp?.eloPoints != null && <span className="mm-elo">{gp.eloPoints}</span>}
                  </div>
                  <div className="mm-player-row-actions">
                    <span className="mm-player-matches">
                      <i className="fas fa-swords" /> {t('ranked.mm.players.matchesThisPeriod', { count })}
                    </span>
                    {isSeasonAdmin && selected.status !== 'closed' && (
                      <button
                        className="mm-icon-btn mm-icon-btn--danger"
                        onClick={() => setRemoveModal(p.id)}
                        title={t('ranked.mm.players.remove')}
                      >
                        <i className="fas fa-ban" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {inactiveCount > 0 && (
              <p className="mm-players-hint">
                <i className="fas fa-user-clock" /> {inactiveCount} {t('ranked.mm.players.inactive')} — {t('ranked.mm.players.inactiveHint')}
              </p>
            )}

            {removedPool.length > 0 && (
              <>
                <h3 style={{ marginTop: '1rem' }}><i className="fas fa-ban" /> {t('ranked.mm.players.removed')} · {removedPool.length}</h3>
                {removedPool.map((p) => {
                  const gp = p.games?.[selected.gameId];
                  return (
                    <div key={p.id} className="mm-player-row mm-player-row--removed">
                      <div className="mm-player-row-info">
                        {gp?.eloRank && <i className={`${getRankIcon(gp.eloRank)} mm-rank-icon`} title={gp.eloRank} />}
                        <span className="mm-player-name">{p.alias || p.name}</span>
                        {gp?.eloPoints != null && <span className="mm-elo">{gp.eloPoints}</span>}
                      </div>
                      <div className="mm-player-row-actions">
                        {isSeasonAdmin && selected.status !== 'closed' && (
                          <button
                            className="mm-icon-btn"
                            onClick={() => handleRemoveParticipant(p.id, false)}
                            disabled={removing}
                            title={t('ranked.mm.players.restore')}
                          >
                            <i className="fas fa-undo" /> {t('ranked.mm.players.restore')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </section>
        )}

        {/* ── Modals ── */}

        {/* Advance period confirm */}
        {showAdvance && (
          <div className="modal-overlay" onClick={() => setShowAdvance(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2><i className="fas fa-forward" /> {t('ranked.mm.modals.advanceTitle')}</h2>
                <button className="btn-icon" onClick={() => setShowAdvance(false)}><i className="fas fa-times" /></button>
              </div>
              <div className="modal-body">
                <p>{t('ranked.mm.modals.advanceBody')}</p>
                <p className="text-secondary" style={{ fontSize: '0.85rem' }}>{t('ranked.mm.modals.advanceNote')}</p>
              </div>
              <div className="modal-footer">
                <button className="btn-outline" onClick={() => setShowAdvance(false)}>{t('ranked.mm.modals.cancel')}</button>
                <button className="btn-primary" onClick={handleAdvance} disabled={advancing}>
                  {advancing ? t('ranked.mm.modals.generating') : t('ranked.mm.advancePeriod')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Forfeit modal */}
        {forfeitModal && (
          <div className="modal-overlay" onClick={() => setForfeitModal(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2><i className="fas fa-flag" /> {t('ranked.mm.modals.forfeitTitle')}</h2>
                <button className="btn-icon" onClick={() => setForfeitModal(null)}><i className="fas fa-times" /></button>
              </div>
              <div className="modal-body">
                <p>
                  {t('ranked.mm.modals.forfeitBody', {
                    name: forfeitModal.player === 'p1'
                      ? pName(forfeitModal.assignment.player1Id)
                      : pName(forfeitModal.assignment.player2Id),
                  })}
                </p>
                <div className="form-group">
                  <label>{t('ranked.mm.modals.noteOptional')}</label>
                  <input
                    className="form-control"
                    value={forfeitNote}
                    onChange={(e) => setForfeitNote(e.target.value)}
                    placeholder={t('ranked.mm.modals.notePlaceholder')}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-outline" onClick={() => setForfeitModal(null)}>{t('ranked.mm.modals.cancel')}</button>
                <button className="btn-danger" onClick={handleForfeit} disabled={forfeitLoading}>
                  {forfeitLoading ? t('ranked.mm.modals.applying') : t('ranked.mm.modals.confirmForfeit')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove participant confirm */}
        {removeModal && (
          <div className="modal-overlay" onClick={() => setRemoveModal(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2><i className="fas fa-ban" /> {t('ranked.mm.modals.removeTitle')}</h2>
                <button className="btn-icon" onClick={() => setRemoveModal(null)}><i className="fas fa-times" /></button>
              </div>
              <div className="modal-body">
                <p>{t('ranked.mm.modals.removeBody', { name: pName(removeModal) })}</p>
              </div>
              <div className="modal-footer">
                <button className="btn-outline" onClick={() => setRemoveModal(null)}>{t('ranked.mm.modals.cancel')}</button>
                <button className="btn-danger" onClick={() => handleRemoveParticipant(removeModal, true)} disabled={removing}>
                  {removing ? t('ranked.mm.modals.applying') : t('ranked.mm.modals.confirmRemove')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Season list ────────────────────────────────────────────────────────────

  return (
    <div className="mm-root">
      <div className="mm-header">
        <div>
          <h2><i className="fas fa-shuffle" /> {t('ranked.mm.title')}</h2>
          <p className="text-secondary">{t('ranked.mm.subtitle')}</p>
        </div>
        {isAdmin && (
          <div className="mm-header-actions">
            <button className="btn-outline" onClick={() => setShowReset(true)} title={t('ranked.mm.deactivateAllTitle')}>
              <i className="fas fa-user-slash" /> {t('ranked.mm.deactivateAll')}
            </button>
            <button className="btn-primary" onClick={() => navigate(getPath('events/matchmaking/create'))}>
              <i className="fas fa-plus" /> {t('ranked.mm.newSeason')}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {actionMsg && <div className="success-message">{actionMsg}</div>}
      {loading && <div className="loading-spinner"><i className="fas fa-spinner fa-spin" /></div>}


      {seasons.length === 0 && !loading && (
        <div className="mm-empty">
          <i className="fas fa-shuffle" style={{ fontSize: '2rem', opacity: 0.3, display: 'block', marginBottom: '0.75rem' }} />
          {t('ranked.mm.empty')}
          {isAdmin && <div style={{ marginTop: '0.75rem' }}>
            <button className="btn-primary btn-sm" onClick={() => navigate(getPath('events/matchmaking/create'))}>
              {t('ranked.mm.createFirst')}
            </button>
          </div>}
        </div>
      )}

      <div className="mm-season-list">
        {seasons.map((s) => {
          const game = GAMES.find((g) => g.id === s.gameId);
          return (
            <div key={s.id} className={`mm-season-card mm-season-card--${s.status}`} onClick={() => loadDetail(s.id)}>
              <div className="mm-season-card-left">
                <span className="mm-season-name">{s.name}</span>
                <div className="mm-season-card-meta">
                  <span><i className="fas fa-redo" /> {s.periodType === 'weekly' ? t('ranked.mm.weekly') : t('ranked.mm.biweekly')}</span>
                  <span><i className="fas fa-swords" /> {t('ranked.mm.matchesPerPlayer', { count: s.matchesPerPlayer })}</span>
                  {s.currentPeriod && s.status !== 'draft' && (
                    <span className="mm-season-period-chip">
                      <i className="fas fa-bolt" /> {t('ranked.mm.period', { n: s.currentPeriod.index + 1 })}
                      {s.totalPeriods != null && `/${s.totalPeriods}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="mm-season-card-right">
                <SeasonBadge status={s.status} />
                {game && <span className="mm-game-badge" style={gameBadgeStyle(game.id)}>{game.shortName}</span>}
                <i className="fas fa-chevron-right mm-season-arrow" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Reset availability modal */}
      {showReset && isAdmin && (
        <div className="modal-overlay" onClick={() => setShowReset(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-user-slash" /> {t('ranked.mm.deactivateAll')}</h2>
              <button className="btn-icon" onClick={() => setShowReset(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="modal-body">
              <p className="text-secondary" style={{ marginBottom: '1rem' }}>
                {t('ranked.mm.modals.resetBody')}
              </p>
              <div className="form-group">
                <label>{t('ranked.mm.modals.game')}</label>
                <select className="form-control" value={resetGameId} onChange={(e) => setResetGameId(e.target.value)}>
                  {GAMES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowReset(false)}>{t('ranked.mm.modals.cancel')}</button>
              <button className="btn-danger" onClick={handleResetAvailability} disabled={resetting}>
                {resetting ? t('ranked.mm.modals.applying') : t('ranked.mm.modals.resetConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
