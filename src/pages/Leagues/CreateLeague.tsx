import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllParticipants } from '@/services/participants/participantService';
import { estimateLeagueDuration, createLeague } from '@/services/leagues/leagueService';
import { getMidnightInTimeZone, DEFAULT_TIMEZONE } from '@/utils/timeZone';
import { GlobalParticipant } from '@/models/types';
import './CreateLeague.css';

function CreateLeague() {
  const navigate = useNavigate();

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
    setAllParticipants(getAllParticipants());
  }, []);

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
      setError('League name is required');
      return;
    }
    if (selectedIds.size < 2) {
      setError('At least 2 participants are required');
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
    });

    setCreating(false);

    if (!result) {
      setError('Failed to create league');
      return;
    }

    navigate(`/events/leagues/${result.league.id}`);
  }

  return (
    <div className="create-league-page">
      <div className="container">
        <div className="create-league-card">
          <h1>Create New League</h1>

          {error && <div className="error-message">{error}</div>}

          <div className="form-section">
            <label>League Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Smash Ultimate League - Spring 2025"
            />
          </div>

          <div className="form-section">
            <label>Game</label>
            <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
              <option value="ssbu">Super Smash Bros. Ultimate</option>
            </select>
          </div>

          <div className="form-section-header">Participants</div>
          <div className="participants-selector">
            <div className="participants-actions">
              <button className="btn-outline btn-sm" onClick={selectAll}>
                <i className="fas fa-users" /> Add All ({allParticipants.length})
              </button>
              <button className="btn-outline btn-sm" onClick={clearAll}>
                Clear
              </button>
              <span className="text-secondary">Selected: {selectedIds.size}</span>
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

          <div className="form-section-header">Match Format</div>
          <div className="form-section">
            <label>Rounds per opponent</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  checked={roundsPerOpponent === 1}
                  onChange={() => setRoundsPerOpponent(1)}
                />
                1 time
              </label>
              <label>
                <input
                  type="radio"
                  checked={roundsPerOpponent === 2}
                  onChange={() => setRoundsPerOpponent(2)}
                />
                2 times
              </label>
              <label>
                <input
                  type="radio"
                  checked={roundsPerOpponent === 3}
                  onChange={() => setRoundsPerOpponent(3)}
                />
                3 times
              </label>
            </div>
          </div>

          <div className="form-section">
            <label>Games per match</label>
            <div className="radio-group">
              {[3, 5, 7, 9].map((n) => (
                <label key={n}>
                  <input
                    type="radio"
                    checked={gamesPerMatch === n}
                    onChange={() => setGamesPerMatch(n as 3 | 5 | 7 | 9)}
                  />
                  Best of {n}
                </label>
              ))}
            </div>
          </div>

          <div className="form-section-header">Schedule</div>
          <div className="form-section">
            <label>Matches per player per period</label>
            <select
              value={matchesPerPeriod}
              onChange={(e) => setMatchesPerPeriod(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'match' : 'matches'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-section">
            <label>Period frequency</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  checked={periodDays === 7}
                  onChange={() => setPeriodDays(7)}
                />
                Weekly
              </label>
              <label>
                <input
                  type="radio"
                  checked={periodDays === 14}
                  onChange={() => setPeriodDays(14)}
                />
                Bi-weekly
              </label>
            </div>
          </div>

          <div className="form-section">
            <label>Start date and time</label>
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
                <option value="America/Havana">America/Havana (Cuba)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="Europe/Madrid">Europe/Madrid (CET/CEST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <p className="form-hint">
              League and matches will start at this exact date and time.
            </p>
          </div>

          {estimate && (
            <div className="estimate-box">
              <div className="estimate-title"><i className="fas fa-chart-bar" /> Estimated Duration</div>
              <div className="estimate-stats">
                <div className="estimate-stat">
                  <span className="estimate-value">{estimate.weeks}</span>
                  <span className="estimate-label">weeks (~{Math.round(estimate.weeks / 4.33)} months)</span>
                </div>
                <div className="estimate-stat">
                  <span className="estimate-value">{estimate.totalMatches}</span>
                  <span className="estimate-label">total matches</span>
                </div>
                <div className="estimate-stat">
                  <span className="estimate-value">{estimate.matchesPerPlayer}</span>
                  <span className="estimate-label">matches per player</span>
                </div>
              </div>
              <div className="estimate-end">
                <i className="fas fa-calendar" /> Estimated end: <strong>{new Date(estimate.endDate).toLocaleDateString()}</strong>
              </div>
            </div>
          )}

          <div className="form-section-header">No-Show Policy</div>
          <div className="form-section">
            <label>Max no-shows before kick</label>
            <select value={maxNoShows} onChange={(e) => setMaxNoShows(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="form-hint">
              Players who don't show up lose ELO as if they lost the match.
            </p>
          </div>

          <div className="form-section">
            <label>Grace period days</label>
            <input
              type="number"
              min={0}
              max={90}
              value={gracePeriodDays}
              onChange={(e) => setGracePeriodDays(Number(e.target.value))}
            />
            <p className="form-hint">
              Extra days after each week to finish and report matches (0 = none).
            </p>
          </div>

          <div className="form-section-header">Playoffs</div>
          <div className="form-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={playoffsEnabled}
                onChange={(e) => setPlayoffsEnabled(e.target.checked)}
              />
              Enable Top 8 playoffs after league ends
            </label>
          </div>

          {playoffsEnabled && (
            <div className="form-section">
              <label>Playoffs ELO multiplier</label>
              <select
                value={playoffsMultiplier}
                onChange={(e) => setPlayoffsMultiplier(Number(e.target.value))}
              >
                <option value={1.0}>1.0x (same as league)</option>
                <option value={1.5}>1.5x (recommended)</option>
                <option value={2.0}>2.0x (high stakes)</option>
              </select>
            </div>
          )}

          <div className="form-actions">
            <button className="btn-outline" onClick={() => navigate('/leagues')}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={creating || selectedIds.size < 2}
            >
              {creating ? 'Creating...' : 'Create League →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateLeague;
