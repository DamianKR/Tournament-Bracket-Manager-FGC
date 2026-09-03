import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getAllParticipants } from '@/services/participants/participantService';
import { estimateLeagueDuration, createLeague } from '@/services/leagues/leagueService';
import { getMidnightInTimeZone, DEFAULT_TIMEZONE } from '@/utils/timeZone';
import { GlobalParticipant } from '@/models/types';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import { useCommunity } from '@/contexts/CommunityContext';
import './CreateLeague.css';

function CreateLeague() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCommunity, getPath } = useCommunity();
  const communityId = currentCommunity?.id ?? DEFAULT_COMMUNITY_ID;

  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Form state
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('ssbu');
  const [roundsPerOpponent, setRoundsPerOpponent] = useState<1 | 2 | 3>(2);
  const [gamesPerMatch, setGamesPerMatch] = useState<3 | 5 | 7 | 9>(3);
  const [matchesPerPeriod, setMatchesPerPeriod] = useState(2);
  const [periodDays, setPeriodDays] = useState<7 | 14>(7);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('20:00');
  const [timeZone, setTimeZone] = useState(DEFAULT_TIMEZONE);
  const [maxNoShows, setMaxNoShows] = useState(3);
  const [gracePeriodDays, setGracePeriodDays] = useState(30);
  const [playoffsEnabled, setPlayoffsEnabled] = useState(true);
  const [playoffsMultiplier, setPlayoffsMultiplier] = useState(1.5);

  // Estimation
  const [estimate, setEstimate] = useState<{
    weeks: number;
    days: number;
    endDate: string;
    totalMatches: number;
    matchesPerPlayer: number;
  } | null>(null);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAllParticipants(getAllParticipants(communityId));
  }, [communityId]);

  useEffect(() => {
    if (selectedIds.size < 2) {
      setEstimate(null);
      return;
    }

    const fetchEstimate = async () => {
      const [h, m] = startTime.split(':').map(Number);
      const midnight = getMidnightInTimeZone(startDate, timeZone);
      const startIso = new Date(midnight.getTime() + (h * 3600 + m * 60) * 1000).toISOString();
      const result = await estimateLeagueDuration({
        participantCount: selectedIds.size,
        roundsPerOpponent,
        matchesPerPlayerPerPeriod: matchesPerPeriod,
        periodDays,
        startDate: startIso,
      });
      setEstimate(result);
    };

    fetchEstimate();
  }, [selectedIds.size, roundsPerOpponent, matchesPerPeriod, periodDays, startDate, startTime, timeZone]);

  function toggleParticipant(id: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  }

  function selectAll() {
    setSelectedIds(new Set(allParticipants.map(p => p.id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError(t('league.create.errors.nameRequired'));
      return;
    }
    if (selectedIds.size < 2) {
      setError(t('league.create.errors.minParticipants'));
      return;
    }

    setCreating(true);
    setError('');

    const [h, m] = startTime.split(':').map(Number);
    const midnight = getMidnightInTimeZone(startDate, timeZone);
    const startIso = new Date(midnight.getTime() + (h * 3600 + m * 60) * 1000).toISOString();

    const result = await createLeague({
      name: name.trim(),
      gameId,
      participantIds: Array.from(selectedIds),
      roundsPerOpponent,
      gamesPerMatch,
      matchesPerPlayerPerPeriod: matchesPerPeriod,
      periodDays,
      startDate: startIso,
      timeZone,
      maxNoShowsBeforeKick: maxNoShows,
      gracePeriodDays,
      playoffsEnabled,
      playoffsEloMultiplier: playoffsMultiplier,
      communityId: currentCommunity?.id ?? DEFAULT_COMMUNITY_ID,
    });

    setCreating(false);

    if (!result) {
      setError(t('league.create.errors.createFailed'));
      return;
    }

    navigate(getPath(`events/leagues/${result.league.id}`));
  }

  return (
    <div className="create-league-page">
      <div className="container">
        <div className="create-league-card">
          <h1>{t('league.create.title')}</h1>

          {error && <div className="error-message">{error}</div>}

          <div className="form-section">
            <label>{t('league.create.nameLabel')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('league.create.namePlaceholder')}
            />
          </div>

          <div className="form-section">
            <label>{t('league.create.gameLabel')}</label>
            <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
              <option value="ssbu">{t('league.create.gameName')}</option>
            </select>
          </div>

          <div className="form-section-header">{t('league.create.participantsHeader')}</div>
          <div className="participants-selector">
            <div className="participants-actions">
              <button className="btn-outline btn-sm" onClick={selectAll}>
                <i className="fas fa-users" /> {t('league.create.addAll', { count: allParticipants.length })}
              </button>
              <button className="btn-outline btn-sm" onClick={clearAll}>
                {t('league.create.clear')}
              </button>
              <span className="text-secondary">{t('league.create.selected', { count: selectedIds.size })}</span>
            </div>
            <div className="participants-grid">
              {allParticipants
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <label key={p.id} className="participant-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleParticipant(p.id)}
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
            </div>
          </div>

          <div className="form-section-header">{t('league.create.matchFormatHeader')}</div>
          <div className="form-section">
            <label>{t('league.create.roundsPerOpponentLabel')}</label>
            <div className="radio-group">
              {[1, 2, 3].map((n) => (
                <label key={n}>
                  <input
                    type="radio"
                    checked={roundsPerOpponent === n}
                    onChange={() => setRoundsPerOpponent(n as 1 | 2 | 3)}
                  />
                  {t('league.create.rounds', { count: n })}
                </label>
              ))}
            </div>
          </div>

          <div className="form-section">
            <label>{t('league.create.gamesPerMatchLabel')}</label>
            <div className="radio-group">
              {[3, 5, 7, 9].map((n) => (
                <label key={n}>
                  <input
                    type="radio"
                    checked={gamesPerMatch === n}
                    onChange={() => setGamesPerMatch(n as 3 | 5 | 7 | 9)}
                  />
                  {t('league.create.bestOf', { count: n })}
                </label>
              ))}
            </div>
          </div>

          <div className="form-section-header">{t('league.create.scheduleHeader')}</div>
          <div className="form-section">
            <label>{t('league.create.matchesPerPlayerLabel')}</label>
            <select
              value={matchesPerPeriod}
              onChange={(e) => setMatchesPerPeriod(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {t('league.create.matchesPerPlayer', { count: n })}
                </option>
              ))}
            </select>
          </div>

          <div className="form-section">
            <label>{t('league.create.periodFrequencyLabel')}</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  checked={periodDays === 7}
                  onChange={() => setPeriodDays(7)}
                />
                {t('league.create.weekly')}
              </label>
              <label>
                <input
                  type="radio"
                  checked={periodDays === 14}
                  onChange={() => setPeriodDays(14)}
                />
                {t('league.create.biweekly')}
              </label>
            </div>
          </div>

          <div className="form-section">
            <label>{t('league.create.startDateTimeLabel')}</label>
            <div className="datetime-row">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                {['America/Havana', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'UTC'].map((tz) => (
                  <option key={tz} value={tz}>
                    {t(`league.create.timezone.${tz}`, { defaultValue: tz })}
                  </option>
                ))}
              </select>
            </div>
            <p className="form-hint">
              {t('league.create.startHint')}
            </p>
          </div>

          {estimate && (
            <div className="estimate-box">
              <div className="estimate-title"><i className="fas fa-chart-bar" /> {t('league.create.estimateTitle')}</div>
              <div className="estimate-stats">
                <div className="estimate-stat">
                  <span className="estimate-value">{estimate.weeks}</span>
                  <span className="estimate-label">{t('league.create.estimateWeeks', { months: Math.round(estimate.weeks / 4.33) })}</span>
                </div>
                <div className="estimate-stat">
                  <span className="estimate-value">{estimate.totalMatches}</span>
                  <span className="estimate-label">{t('league.create.totalMatches')}</span>
                </div>
                <div className="estimate-stat">
                  <span className="estimate-value">{estimate.matchesPerPlayer}</span>
                  <span className="estimate-label">{t('league.create.matchesPerPlayerStat')}</span>
                </div>
              </div>
              <div className="estimate-end">
                <i className="fas fa-calendar" /> {t('league.create.estimatedEnd', { date: new Date(estimate.endDate).toLocaleDateString() })}
              </div>
            </div>
          )}

          <div className="form-section-header">{t('league.create.noShowPolicyHeader')}</div>
          <div className="form-section">
            <label>{t('league.create.maxNoShowsLabel')}</label>
            <select value={maxNoShows} onChange={(e) => setMaxNoShows(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="form-hint">
              {t('league.create.noShowsHint')}
            </p>
          </div>

          <div className="form-section">
            <label>{t('league.create.gracePeriodLabel')}</label>
            <input
              type="number"
              min={0}
              max={90}
              value={gracePeriodDays}
              onChange={(e) => setGracePeriodDays(Number(e.target.value))}
            />
            <p className="form-hint">
              {t('league.create.graceHint')}
            </p>
          </div>

          <div className="form-section-header">{t('league.create.playoffsHeader')}</div>
          <div className="form-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={playoffsEnabled}
                onChange={(e) => setPlayoffsEnabled(e.target.checked)}
              />
              {t('league.create.playoffsCheckbox')}
            </label>
          </div>

          {playoffsEnabled && (
            <div className="form-section">
              <label>{t('league.create.playoffsMultiplierLabel')}</label>
              <select
                value={playoffsMultiplier}
                onChange={(e) => setPlayoffsMultiplier(Number(e.target.value))}
              >
                {[1.0, 1.5, 2.0].map((m) => (
                  <option key={m} value={m}>
                    {t(`league.create.multiplierLabels.${m}`)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-actions">
            <button className="btn-outline" onClick={() => navigate(getPath('events?tab=leagues'))}>
              {t('league.create.cancel')}
            </button>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={creating || selectedIds.size < 2}
            >
              {creating ? t('league.create.creating') : t('league.create.createButton')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateLeague;
