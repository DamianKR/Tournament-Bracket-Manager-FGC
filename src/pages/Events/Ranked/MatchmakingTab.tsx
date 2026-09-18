import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAMES } from '@/data/games';
import { useCommunity } from '@/contexts/CommunityContext';
import { getAllParticipantsAsync } from '@/services/participants/participantService';
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
} from '@/services/matchmaking/matchmakingService';
import './MatchmakingTab.css';

interface MatchmakingTabProps {
  onReportAssignment: (assignment: MatchmakingAssignment) => void;
}

function StatusBadge({ status }: { status: MatchmakingAssignment['status'] }) {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    completed: 'Completado',
    forfeit_p1: 'Forfeit J1',
    forfeit_p2: 'Forfeit J2',
    cancelled: 'Cancelado',
  };
  return <span className={`mm-status mm-status--${status}`}>{labels[status] ?? status}</span>;
}

function SeasonBadge({ status }: { status: MatchmakingSeason['status'] }) {
  const labels: Record<string, string> = { draft: 'Borrador', active: 'Activa', closed: 'Cerrada' };
  return <span className={`mm-season-badge mm-season-badge--${status}`}>{labels[status] ?? status}</span>;
}

export default function MatchmakingTab({ onReportAssignment }: MatchmakingTabProps) {
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

  // Info banner (dismissible, remembered)
  const [showInfo, setShowInfo] = useState(
    () => localStorage.getItem('mm-info-dismissed') !== '1'
  );
  const dismissInfo = () => {
    localStorage.setItem('mm-info-dismissed', '1');
    setShowInfo(false);
  };

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
      flash(`Período generado: ${result.assignments.length} partidas para ${result.totalPlayers} jugadores`);
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
      flash(`Período ${result.season.currentPeriod.index + 1} iniciado — ${result.assignments.length} partidas generadas`);
      await loadDetail(selected.id);
      await loadSeasons();
    } catch (e: any) { setError(e.message); } finally { setAdvancing(false); }
  }

  async function handleClose(seasonId: string) {
    setLoading(true); setError('');
    try {
      const result = await closeSeason(seasonId);
      flash(`Temporada cerrada. ${result.closedAssignments} partidas pendientes canceladas.`);
      await loadDetail(seasonId);
      await loadSeasons();
    } catch (e: any) { setError(e.message); setLoading(false); }
  }

  async function handleDelete(seasonId: string) {
    setLoading(true); setError('');
    try {
      await deleteSeason(seasonId);
      setSelected(null);
      flash('Temporada eliminada');
      await loadSeasons();
    } catch (e: any) { setError(e.message); setLoading(false); }
  }

  async function handleForfeit() {
    if (!forfeitModal) return;
    setForfeitLoading(true); setError('');
    const { assignment, player } = forfeitModal;
    const forfeitPlayerId = player === 'p1' ? assignment.player1Id : assignment.player2Id;
    try {
      await forfeitAssignment(assignment.id, forfeitPlayerId, forfeitNote || undefined);
      setForfeitModal(null); setForfeitNote('');
      flash('Forfeit aplicado');
      if (selected) await loadDetail(selected.id);
    } catch (e: any) { setError(e.message); } finally { setForfeitLoading(false); }
  }

  async function handleCancel(assignmentId: string) {
    setError('');
    try {
      await cancelAssignment(assignmentId, 'admin_cancelled');
      flash('Partida cancelada sin penalización');
      if (selected) await loadDetail(selected.id);
    } catch (e: any) { setError(e.message); }
  }

  async function handleResetAvailability() {
    if (!resetGameId) return;
    setResetting(true); setError('');
    try {
      const result = await resetAvailability(communityId, resetGameId);
      setShowReset(false);
      flash(`${result.updated} participante${result.updated !== 1 ? 's' : ''} puestos en inactivo. Deben activarse ellos mismos.`);
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
          {a.status === 'pending' && isMine && (
            <button className="btn-primary btn-sm" onClick={() => onReportAssignment(a)}>
              <i className="fas fa-gamepad" /> Reportar
            </button>
          )}
          {a.status === 'pending' && isGameAdmin && (
            <div className="mm-admin-icons">
              <button
                className="mm-icon-btn"
                onClick={() => setForfeitModal({ assignment: a, player: 'p1' })}
                title={`Forfeit ${pName(a.player1Id)}`}
              >
                <i className="fas fa-flag" /> {pName(a.player1Id)}
              </button>
              <button
                className="mm-icon-btn"
                onClick={() => setForfeitModal({ assignment: a, player: 'p2' })}
                title={`Forfeit ${pName(a.player2Id)}`}
              >
                <i className="fas fa-flag" /> {pName(a.player2Id)}
              </button>
              <button
                className="mm-icon-btn mm-icon-btn--danger"
                onClick={() => handleCancel(a.id)}
                title="Cancelar sin penalización"
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
              <i className="fas fa-arrow-left" /> Temporadas
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
              <span className="mm-stat-label">Frecuencia</span>
            </div>
            <div className="mm-stat">
              <span className="mm-stat-value">{selected.matchesPerPlayer}</span>
              <span className="mm-stat-label">Partidas/jugador</span>
            </div>
            <div className="mm-stat">
              <span className="mm-stat-value">{selected.gracePeriodDays}d</span>
              <span className="mm-stat-label">Gracia</span>
            </div>
            <div className="mm-stat">
              <span className="mm-stat-value">
                {selected.totalPeriods != null
                  ? `${(period?.index ?? 0) + 1}/${selected.totalPeriods}`
                  : `#${(period?.index ?? 0) + 1}`}
              </span>
              <span className="mm-stat-label">
                {selected.totalPeriods != null ? 'Períodos' : 'Período actual'}
              </span>
            </div>
            <div className="mm-stat">
              <span className="mm-stat-value">{completedCount}/{assignments.length}</span>
              <span className="mm-stat-label">Jugadas</span>
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
                <span>Período {period.index + 1}</span>
                <span className={`mm-period-status-tag ${period.status}`}>
                  {period.status === 'active' && <><i className="fas fa-circle" /> En curso</>}
                  {period.status === 'pending' && <><i className="fas fa-clock" /> Sin generar</>}
                  {period.status === 'skipped' && <><i className="fas fa-forward" /> Saltado</>}
                </span>
              </div>
              <span className="mm-period-days-left">
                {period.status === 'active' && (daysLeft === 0 ? 'Último día' : `${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`)}
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
                  <i className="fas fa-shuffle" /> Generar Período 1
                </button>
                <button className="btn-danger" onClick={() => handleDelete(selected.id)} disabled={loading}>
                  <i className="fas fa-trash" /> Eliminar
                </button>
              </>
            )}
            {selected.status === 'active' && (
              <>
                {(period?.status === 'pending' || period?.status === 'skipped') && (
                  <button className="btn-primary" onClick={() => handleGenerate(selected.id)} disabled={loading}>
                    <i className="fas fa-shuffle" /> Generar Período {(period?.index ?? 0) + 1}
                  </button>
                )}
                {period?.status === 'active' && (
                  <button className="btn-outline" onClick={() => setShowAdvance(true)} disabled={loading}>
                    <i className="fas fa-forward" /> Avanzar período
                  </button>
                )}
                <button className="btn-danger" onClick={() => handleClose(selected.id)} disabled={loading}>
                  <i className="fas fa-lock" /> Cerrar temporada
                </button>
              </>
            )}
          </div>
        )}

        {/* Assignments */}
        {myAssignments.length > 0 && (
          <section className="mm-section">
            <h3><i className="fas fa-user" /> Mis partidas</h3>
            {myAssignments.map(renderAssignment)}
          </section>
        )}
        {isAdmin && otherAssignments.length > 0 && (
          <section className="mm-section">
            <h3><i className="fas fa-list" /> Todos los emparejamientos</h3>
            {otherAssignments.map(renderAssignment)}
          </section>
        )}
        {!isAdmin && myAssignments.length === 0 && (
          <div className="mm-empty">No estás incluido en el período actual.</div>
        )}
        {assignments.length === 0 && selected.status === 'active' && (
          <div className="mm-empty">El período aún no ha sido generado.</div>
        )}

        {/* ── Modals ── */}

        {/* Advance period confirm */}
        {showAdvance && (
          <div className="modal-overlay" onClick={() => setShowAdvance(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2><i className="fas fa-forward" /> Avanzar al siguiente período</h2>
                <button className="btn-icon" onClick={() => setShowAdvance(false)}><i className="fas fa-times" /></button>
              </div>
              <div className="modal-body">
                <p>Los matches pendientes del período actual serán <strong>cancelados sin penalización</strong> y se generarán nuevos emparejamientos.</p>
                <p className="text-secondary" style={{ fontSize: '0.85rem' }}>Los resultados ya reportados no se modifican.</p>
              </div>
              <div className="modal-footer">
                <button className="btn-outline" onClick={() => setShowAdvance(false)}>Cancelar</button>
                <button className="btn-primary" onClick={handleAdvance} disabled={advancing}>
                  {advancing ? 'Generando...' : 'Avanzar período'}
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
                <h2><i className="fas fa-flag" /> Marcar Forfeit</h2>
                <button className="btn-icon" onClick={() => setForfeitModal(null)}><i className="fas fa-times" /></button>
              </div>
              <div className="modal-body">
                <p>
                  Se marcará como no-show a <strong>
                    {forfeitModal.player === 'p1'
                      ? pName(forfeitModal.assignment.player1Id)
                      : pName(forfeitModal.assignment.player2Id)}
                  </strong> y se aplicará la pérdida de ELO correspondiente.
                </p>
                <div className="form-group">
                  <label>Nota (opcional)</label>
                  <input
                    className="form-control"
                    value={forfeitNote}
                    onChange={(e) => setForfeitNote(e.target.value)}
                    placeholder="Ej: No se presentó al evento"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-outline" onClick={() => setForfeitModal(null)}>Cancelar</button>
                <button className="btn-danger" onClick={handleForfeit} disabled={forfeitLoading}>
                  {forfeitLoading ? 'Aplicando...' : 'Confirmar Forfeit'}
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
          <h2><i className="fas fa-shuffle" /> Matchmaking</h2>
          <p className="text-secondary">Emparejamientos automáticos por período — semanal o bisemanal</p>
        </div>
        {isAdmin && (
          <div className="mm-header-actions">
            <button className="btn-outline" onClick={() => setShowReset(true)} title="Poner a todos en inactivo">
              <i className="fas fa-user-slash" /> Desactivar todos
            </button>
            <button className="btn-primary" onClick={() => navigate(getPath('events/matchmaking/create'))}>
              <i className="fas fa-plus" /> Nueva temporada
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {actionMsg && <div className="success-message">{actionMsg}</div>}
      {loading && <div className="loading-spinner"><i className="fas fa-spinner fa-spin" /></div>}

      {/* Explainer banner */}
      {showInfo && (
        <div className="mm-info-banner">
          <button className="mm-info-close" onClick={dismissInfo} title="Entendido">
            <i className="fas fa-times" />
          </button>
          <div className="mm-info-steps">
            <div className="mm-info-step">
              <div className="mm-info-step-icon"><i className="fas fa-calendar-week" /></div>
              <div>
                <strong>Temporada por períodos</strong>
                <span>Semanal o bisemanal. Cada período se te asignan rivales automáticamente.</span>
              </div>
            </div>
            <div className="mm-info-step">
              <div className="mm-info-step-icon"><i className="fas fa-swords" /></div>
              <div>
                <strong>Rivales por ELO</strong>
                <span>El sistema te empareja con jugadores de nivel similar y rota oponentes.</span>
              </div>
            </div>
            <div className="mm-info-step">
              <div className="mm-info-step-icon"><i className="fas fa-trophy" /></div>
              <div>
                <strong>Partidas obligatorias</strong>
                <span>Reporta el resultado antes del cierre. No jugar cuenta como derrota.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {seasons.length === 0 && !loading && (
        <div className="mm-empty">
          <i className="fas fa-shuffle" style={{ fontSize: '2rem', opacity: 0.3, display: 'block', marginBottom: '0.75rem' }} />
          No hay temporadas de matchmaking aún.
          {isAdmin && <div style={{ marginTop: '0.75rem' }}>
            <button className="btn-primary btn-sm" onClick={() => navigate(getPath('events/matchmaking/create'))}>
              Crear la primera
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
                  <span><i className="fas fa-redo" /> {s.periodType === 'weekly' ? 'Semanal' : 'Bisemanal'}</span>
                  <span><i className="fas fa-swords" /> {s.matchesPerPlayer} partidas/jugador</span>
                  {s.currentPeriod && s.status !== 'draft' && (
                    <span className="mm-season-period-chip">
                      <i className="fas fa-bolt" /> Período {s.currentPeriod.index + 1}
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
              <h2><i className="fas fa-user-slash" /> Desactivar todos</h2>
              <button className="btn-icon" onClick={() => setShowReset(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="modal-body">
              <p className="text-secondary" style={{ marginBottom: '1rem' }}>
                Todos los participantes de ese juego quedarán en <strong>Inactivo</strong>.
                Deben activarse manualmente para entrar en el próximo período.
              </p>
              <div className="form-group">
                <label>Juego</label>
                <select className="form-control" value={resetGameId} onChange={(e) => setResetGameId(e.target.value)}>
                  {GAMES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowReset(false)}>Cancelar</button>
              <button className="btn-danger" onClick={handleResetAvailability} disabled={resetting}>
                {resetting ? 'Aplicando...' : 'Confirmar — Desactivar todos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
