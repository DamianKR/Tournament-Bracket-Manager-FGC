import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GAMES } from '@/data/games';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import { useCommunity } from '@/contexts/CommunityContext';
import { createSeason } from '@/services/matchmaking/matchmakingService';
import { useToast } from '@/contexts/NotificationContext';
import './CreateMatchmaking.css';

type DurationMode = 'open' | 'periods' | 'date';

function CreateMatchmaking() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();

  const PERIOD_OPTIONS = [
    { value: 'weekly',   days: 7,  icon: 'fas fa-calendar-week', label: t('ranked.mm.create.weekly'),   sub: t('ranked.mm.create.every7')  },
    { value: 'biweekly', days: 14, icon: 'fas fa-calendar-alt',  label: t('ranked.mm.create.biweekly'), sub: t('ranked.mm.create.every14') },
  ] as const;
  const { currentCommunity, getPath, canAdminGame, communityGames } = useCommunity();
  const communityId = currentCommunity?.id ?? DEFAULT_COMMUNITY_ID;
  // Solo juegos habilitados en la comunidad (y administrables por este admin)
  const creatableGames = communityGames.filter((g) => canAdminGame(g.id));

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
    if (!name.trim()) { setError(t('ranked.mm.create.errName')); return; }
    if (!gameId)      { setError(t('ranked.mm.create.errGame')); return; }
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
      toast.error(e.message ?? t('ranked.mm.create.errCreate'));
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
              <h1>{t('ranked.mm.create.title')}</h1>
              <p className="cm-subtitle">{t('ranked.mm.create.subtitle')}</p>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          {/* ── Nombre + Juego ── */}
          <div className="cm-grid-2">
            <div className="form-group">
              <label className="cm-label">{t('ranked.mm.create.seasonName')}</label>
              <input
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('ranked.mm.create.namePlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="cm-label">{t('ranked.mm.create.game')}</label>
              <select className="form-control" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                {creatableGames.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Tipo de período ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-clock" /> {t('ranked.mm.create.frequencyTitle')}</div>
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
            <div className="cm-section-title"><i className="fas fa-khanda" /> {t('ranked.mm.create.matchesTitle')}</div>
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
            <p className="cm-hint">{t('ranked.mm.create.rivalsHint', { count: matchesPerPlayer })}</p>
          </div>

          {/* ── Fecha de inicio ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-calendar" /> {t('ranked.mm.create.startDateTitle')}</div>
            <div className="cm-grid-2">
              <div className="form-group">
                <label className="cm-label">{t('ranked.mm.create.date')}</label>
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
                  <span>{t('ranked.mm.create.periodStart', { date: startDate })}</span>
                </div>
                <div className="cm-preview-row">
                  <i className="fas fa-stop-circle" />
                  <span>{t('ranked.mm.create.periodEnd', { date: periodEnd.toISOString().split('T')[0] })}</span>
                </div>
                <div className="cm-preview-row">
                  <i className="fas fa-hourglass-half" />
                  <span>{t('ranked.mm.create.gracePreview', { count: graceDays })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Duración de la temporada ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-flag-checkered" /> {t('ranked.mm.create.durationTitle')}</div>
            <div className="cm-duration-cards">
              <button
                className={`cm-duration-card${durationMode === 'periods' ? ' selected' : ''}`}
                onClick={() => setDurationMode('periods')}
              >
                <i className="fas fa-list-ol" />
                <div>
                  <span className="cm-period-label">{t('ranked.mm.create.durPeriods')}</span>
                  <span className="cm-period-sub">{t('ranked.mm.create.durPeriodsSub')}</span>
                </div>
              </button>
              <button
                className={`cm-duration-card${durationMode === 'date' ? ' selected' : ''}`}
                onClick={() => setDurationMode('date')}
              >
                <i className="fas fa-calendar-check" />
                <div>
                  <span className="cm-period-label">{t('ranked.mm.create.durDate')}</span>
                  <span className="cm-period-sub">{t('ranked.mm.create.durDateSub')}</span>
                </div>
              </button>
              <button
                className={`cm-duration-card${durationMode === 'open' ? ' selected' : ''}`}
                onClick={() => setDurationMode('open')}
              >
                <i className="fas fa-infinity" />
                <div>
                  <span className="cm-period-label">{t('ranked.mm.create.durOpen')}</span>
                  <span className="cm-period-sub">{t('ranked.mm.create.durOpenSub')}</span>
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
                  {t('ranked.mm.create.durPeriodsHint', { periods: totalPeriods, days: periodType === 'weekly' ? 7 : 14 })}
                </p>
              </div>
            )}

            {durationMode === 'date' && (
              <div className="cm-duration-input">
                <div className="form-group" style={{ maxWidth: '220px' }}>
                  <label className="cm-label">{t('ranked.mm.create.closeDate')}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <p className="cm-hint">{t('ranked.mm.create.durDateHint')}</p>
              </div>
            )}

            {durationMode === 'open' && (
              <div className="cm-duration-input">
                <p className="cm-hint">
                  <i className="fas fa-info-circle" style={{ marginRight: '0.4rem' }} />
                  {t('ranked.mm.create.durOpenHint')}
                </p>
              </div>
            )}
          </div>

          {/* ── Período de gracia ── */}
          <div className="cm-section">
            <div className="cm-section-title"><i className="fas fa-shield-alt" /> {t('ranked.mm.create.graceTitle')}</div>
            <div className="cm-grace-row">
              <input
                type="range"
                min={0}
                max={14}
                value={graceDays}
                onChange={(e) => setGraceDays(Number(e.target.value))}
                className="cm-range"
              />
              <div className="cm-grace-value">{graceDays} <span>{t('ranked.mm.create.graceDays')}</span></div>
            </div>
            <p className="cm-hint">
              {t('ranked.mm.create.graceHint')}
            </p>
          </div>

          {/* ── Game badge preview ── */}
          {selectedGame && (
            <div className="cm-game-preview" style={{ borderColor: selectedGame.color }}>
              <span className="cm-game-dot" style={{ background: selectedGame.color }} />
              <span className="cm-game-name">{selectedGame.name}</span>
              <span className="cm-game-tag">{t('ranked.mm.create.gameActive')}</span>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="cm-actions">
            <button className="btn-outline" onClick={() => navigate(getPath('events?tab=ranked&sub=matchmaking'))}>
              {t('ranked.mm.create.cancel')}
            </button>
            <button className="btn-primary cm-create-btn" onClick={handleCreate} disabled={creating}>
              {creating
                ? <><i className="fas fa-spinner fa-spin" /> {t('ranked.mm.create.creating')}</>
                : <><i className="fas fa-shuffle" /> {t('ranked.mm.create.create')}</>}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default CreateMatchmaking;
