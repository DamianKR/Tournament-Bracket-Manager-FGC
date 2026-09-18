import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAMES } from '@/data/games';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import { useCommunity } from '@/contexts/CommunityContext';
import { createSeason } from '@/services/matchmaking/matchmakingService';
import './CreateMatchmaking.css';

const PERIOD_OPTIONS = [
  { value: 'weekly',    days: 7,  icon: 'fas fa-calendar-week',     label: 'Semanal',    sub: 'Cada 7 días'  },
  { value: 'biweekly',  days: 14, icon: 'fas fa-calendar-alt',      label: 'Bisemanal',  sub: 'Cada 14 días' },
] as const;

type DurationMode = 'open' | 'periods' | 'date';

function CreateMatchmaking() {
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminGame } = useCommunity();
  const communityId = currentCommunity?.id ?? DEFAULT_COMMUNITY_ID;
  const creatableGames = GAMES.filter((g) => canAdminGame(g.id));

  const [name, setName]               = useState('');
  const [gameId, setGameId]           = useState<string>(creatableGames[0]?.id ?? GAMES[0]?.id ?? 'ssbu');
  const [periodType, setPeriodType]   = useState<'weekly' | 'biweekly'>('weekly');
  const [matchesPerPlayer, setMatchesPerPlayer] = useState(2);
  const [graceDays, setGraceDays]     = useState(7);
  const [startDate, setStartDate]     = useState(new Date().toISOString().split('T')[0]);

  // Duration
  const [durationMode, setDurationMode]   = useState<DurationMode>('periods');
  const [totalPeriods, setTotalPeriods]   = useState(4);
  const [endDate, setEndDate]             = useState('');

  const [creating, setCreating]       = useState(false);
  const [error, setError]             = useState('');

  const selectedGame = GAMES.find((g) => g.id === gameId);
  const periodDays = periodType === 'biweekly' ? 14 : 7;
  const periodEnd  = new Date(new Date(startDate).getTime() + periodDays * 86400000);

  async function handleCreate() {
    if (!name.trim()) { setError('El nombre es requerido'); return; }
    if (!gameId)      { setError('Selecciona un juego'); return; }
    setCreating(true); setError('');
    try {
      await createSeason({
        communityId,
        gameId,
        name: name.trim(),
        periodType,
        matchesPerPlayer,
        gracePeriodDays: graceDays,
        startDate: new Date(startDate).toISOString(),
        // Duration
        ...(durationMode === 'periods' ? { totalPeriods } : {}),
        ...(durationMode === 'date' && endDate ? { endDate: new Date(endDate).toISOString() } : {}),
      });
      navigate(getPath(`events?tab=ranked&sub=matchmaking`));
    } catch (e: any) {
      setError(e.message ?? 'Error al crear la temporada');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="cm-page">
      <div className="container">
        <div className="cm-card">

          {/* Header */}
          <div className="cm-header">
            <div className="cm-header-icon"><i className="fas fa-shuffle" /></div>
            <div>
              <h1>Nueva temporada de matchmaking</h1>
              <p className="cm-subtitle">Los emparejamientos se generan automáticamente cada período</p>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          {/* ── Nombre + Juego ── */}
          <div className="cm-grid-2">
            <div className="form-group">
              <label className="cm-label">Nombre de la temporada</label>
              <input
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Temporada Septiembre 2026"
              />
            </div>
            <div className="form-group">
              <label className="cm-label">Juego</label>
              <select className="form-control" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                {creatableGames.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Tipo de período ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-clock" /> Frecuencia del emparejamiento</div>
            <div className="cm-period-cards">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`cm-period-card${periodType === opt.value ? ' selected' : ''}`}
                  onClick={() => setPeriodType(opt.value)}
                >
                  <i className={opt.icon} />
                  <div>
                    <span className="cm-period-label">{opt.label}</span>
                    <span className="cm-period-sub">{opt.sub}</span>
                  </div>
                  {periodType === opt.value && <i className="fas fa-check-circle cm-period-check" />}
                </button>
              ))}
            </div>
          </div>

          {/* ── Partidas por jugador ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-swords" /> Partidas por jugador por período</div>
            <div className="cm-matches-row">
              {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                <button
                  key={n}
                  className={`cm-match-btn${matchesPerPlayer === n ? ' selected' : ''}`}
                  onClick={() => setMatchesPerPlayer(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="cm-hint">Cada jugador recibirá {matchesPerPlayer} rival{matchesPerPlayer !== 1 ? 'es' : ''} distinto{matchesPerPlayer !== 1 ? 's' : ''} por período.</p>
          </div>

          {/* ── Fecha de inicio ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-calendar" /> Fecha de inicio</div>
            <div className="cm-grid-2">
              <div className="form-group">
                <label className="cm-label">Fecha</label>
                <input
                  type="date"
                  className="form-control"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="cm-preview">
                <div className="cm-preview-row">
                  <i className="fas fa-play-circle" />
                  <span>Período 1: <strong>{startDate}</strong></span>
                </div>
                <div className="cm-preview-row">
                  <i className="fas fa-stop-circle" />
                  <span>Termina: <strong>{periodEnd.toISOString().split('T')[0]}</strong></span>
                </div>
                <div className="cm-preview-row">
                  <i className="fas fa-hourglass-half" />
                  <span>Gracia: <strong>+{graceDays} días</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Duración de la temporada ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-flag-checkered" /> Duración de la temporada</div>
            <div className="cm-duration-cards">
              <button
                className={`cm-duration-card${durationMode === 'periods' ? ' selected' : ''}`}
                onClick={() => setDurationMode('periods')}
              >
                <i className="fas fa-list-ol" />
                <div>
                  <span className="cm-period-label">N° de períodos</span>
                  <span className="cm-period-sub">Termina automáticamente</span>
                </div>
              </button>
              <button
                className={`cm-duration-card${durationMode === 'date' ? ' selected' : ''}`}
                onClick={() => setDurationMode('date')}
              >
                <i className="fas fa-calendar-check" />
                <div>
                  <span className="cm-period-label">Fecha límite</span>
                  <span className="cm-period-sub">Termina en fecha exacta</span>
                </div>
              </button>
              <button
                className={`cm-duration-card${durationMode === 'open' ? ' selected' : ''}`}
                onClick={() => setDurationMode('open')}
              >
                <i className="fas fa-infinity" />
                <div>
                  <span className="cm-period-label">Indefinida</span>
                  <span className="cm-period-sub">Cierra el admin manualmente</span>
                </div>
              </button>
            </div>

            {durationMode === 'periods' && (
              <div className="cm-duration-input">
                <div className="cm-matches-row">
                  {[2,4,6,8,10,12].map((n) => (
                    <button
                      key={n}
                      className={`cm-match-btn${totalPeriods === n ? ' selected' : ''}`}
                      onClick={() => setTotalPeriods(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="cm-hint">
                  La temporada corre {totalPeriods} período{totalPeriods !== 1 ? 's' : ''} de {periodType === 'weekly' ? '7' : '14'} días cada uno — se cierra sola después.
                </p>
              </div>
            )}

            {durationMode === 'date' && (
              <div className="cm-duration-input">
                <div className="form-group" style={{ maxWidth: '220px' }}>
                  <label className="cm-label">Fecha de cierre</label>
                  <input
                    type="date"
                    className="form-control"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <p className="cm-hint">La temporada se cierra automáticamente al llegar esa fecha.</p>
              </div>
            )}

            {durationMode === 'open' && (
              <div className="cm-duration-input">
                <p className="cm-hint">
                  <i className="fas fa-info-circle" style={{ marginRight: '0.4rem' }} />
                  Sin fecha de fin — tú la cierras manualmente desde el panel de la temporada cuando quieras.
                </p>
              </div>
            )}
          </div>

          {/* ── Período de gracia ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-shield-alt" /> Período de gracia</div>
            <div className="cm-grace-row">
              <input
                type="range"
                min={0}
                max={14}
                value={graceDays}
                onChange={(e) => setGraceDays(Number(e.target.value))}
                className="cm-range"
              />
              <div className="cm-grace-value">{graceDays} <span>días</span></div>
            </div>
            <p className="cm-hint">
              Días extra tras el fin del período antes de que los matches pendientes se cancelen.
              Durante la gracia los jugadores pueden seguir reportando resultados.
            </p>
          </div>

          {/* ── Game badge preview ── */}
          {selectedGame && (
            <div className="cm-game-preview" style={{ borderColor: selectedGame.color }}>
              <span className="cm-game-dot" style={{ background: selectedGame.color }} />
              <span className="cm-game-name">{selectedGame.name}</span>
              <span className="cm-game-tag">Matchmaking activo para este juego</span>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="cm-actions">
            <button className="btn-outline" onClick={() => navigate(getPath('events?tab=ranked&sub=matchmaking'))}>
              Cancelar
            </button>
            <button className="btn-primary cm-create-btn" onClick={handleCreate} disabled={creating}>
              {creating
                ? <><i className="fas fa-spinner fa-spin" /> Creando...</>
                : <><i className="fas fa-shuffle" /> Crear temporada</>}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default CreateMatchmaking;
