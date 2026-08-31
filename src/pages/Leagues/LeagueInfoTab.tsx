import { League } from '@/models/league';
import { formatInTimeZone } from '@/utils/timeZone';
import './LeagueInfoTab.css';

interface LeagueInfoTabProps {
  league: League;
}

function LeagueInfoTab({ league }: LeagueInfoTabProps) {
  const weeks = Object.keys(league.weekStartDates || {}).map(Number).sort((a, b) => a - b);
  const lastWeek = weeks.length > 0 ? Math.max(...weeks) : 0;
  const lastWeekStart = lastWeek ? formatInTimeZone(league.weekStartDates[lastWeek], league.timeZone) : 'TBD';

  return (
    <div className="league-info-tab">
      <div className="info-hero card">
        <h2>What is this league?</h2>
        <p className="league-info-subtitle">
          {league.name} is a round-robin season where every player faces each other over several weeks.
        </p>
      </div>

      <div className="info-grid">
        <div className="info-card card">
          <h3><i className="fas fa-globe" /> Time zone</h3>
          <p className="info-text">
            All dates and times are shown in <strong>{league.timeZone || 'America/Havana'}</strong>.
            The league started on <strong>{formatInTimeZone(league.startDate, league.timeZone)}</strong> and every week begins at the same local time.
          </p>
        </div>

        <div className="info-card card">
          <h3><i className="fas fa-calendar-alt" /> Schedule</h3>
          <ul>
            <li><strong>Start:</strong> {formatInTimeZone(league.startDate, league.timeZone)}</li>
            <li><strong>Period:</strong> {league.periodDays} days per week</li>
            <li><strong>Total weeks:</strong> {weeks.length}</li>
            <li><strong>Last week starts:</strong> {lastWeekStart}</li>
            <li><strong>Matches per player each week:</strong> {league.matchesPerPlayerPerPeriod}</li>
          </ul>
        </div>

        <div className="info-card card">
          <h3><i className="fas fa-gamepad" /> Match format</h3>
          <ul>
            <li><strong>Game:</strong> {league.gameId.toUpperCase()}</li>
            <li><strong>Best of:</strong> {league.gamesPerMatch} games</li>
            <li><strong>Rounds per opponent:</strong> {league.roundsPerOpponent}</li>
            <li><strong>Players:</strong> {league.participantIds.length}</li>
          </ul>
          <p className="info-text">
            Win by taking <strong>{Math.ceil(league.gamesPerMatch / 2)} games</strong>. For example, a Best of 3 is won 2-0 or 2-1.
          </p>
        </div>

        <div className="info-card card">
          <h3><i className="fas fa-shield-alt" /> Penalties and grace</h3>
          <ul>
            <li><strong>Grace period:</strong> {league.gracePeriodDays} extra days after each week to report matches</li>
            <li><strong>No-shows before kick:</strong> {league.maxNoShowsBeforeKick}</li>
            <li><strong>Playoffs:</strong> {league.playoffsEnabled ? `Top 8 players, ELO multiplied by ${league.playoffsEloMultiplier}` : 'Disabled'}</li>
          </ul>
        </div>

        <div className="info-card card info-highlight">
          <h3><i className="fas fa-info-circle" /> How it works (step by step)</h3>
          <ol>
            <li>
              <strong>Weekly assignment:</strong> every Monday (or period start) the Schedule tab updates with your new opponents for the week.
            </li>
            <li>
              <strong>Play your match:</strong> contact your opponent and play the match during the week.
            </li>
            <li>
              <strong>Report the result:</strong> any of the two players can open the match and report the score, winner and optional photo. The match is not final yet.
            </li>
            <li>
              <strong>Other player confirms:</strong> the opponent opens the same match and reports the same result. When both match, the result is finalized and ELO is updated.
            </li>
            <li>
              <strong>If results differ:</strong> the match goes to Pending Review. An admin will check the evidence and decide the final result.
            </li>
            <li>
              <strong>Grace period:</strong> if you cannot play in the exact week, you have <strong>{league.gracePeriodDays} extra days</strong> to finish and report the match.
            </li>
            <li>
              <strong>No-shows:</strong> if a player does not show up, the present player wins. If a player reaches <strong>{league.maxNoShowsBeforeKick} no-shows</strong>, an admin can kick them from the league.
            </li>
            <li>
              <strong>Standings:</strong> wins and losses update the ELO ranking. Playoffs are available for the Top 8 if enabled.
            </li>
          </ol>
        </div>

        <div className="info-card card">
          <h3><i className="fas fa-exclamation-circle" /> Important</h3>
          <ul>
            <li>Both players must report the same score/winner for the match to count automatically.</li>
            <li>Always attach a screenshot if the opponent might disagree.</li>
            <li>After {league.gracePeriodDays} days the match can be marked as expired and reviewed by an admin.</li>
            <li>If you are not an admin, you cannot resolve conflicts.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default LeagueInfoTab;
