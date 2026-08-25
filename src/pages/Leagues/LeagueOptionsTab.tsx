import { League } from '@/models/league';
import { getLeagueDisplayStatus } from '@/services/leagues/leagueService';
import './LeagueOptionsTab.css';

interface LeagueOptionsTabProps {
  league: League;
}

function LeagueOptionsTab({ league }: LeagueOptionsTabProps) {
  const gameNames: Record<string, string> = {
    ssbu: 'Super Smash Bros. Ultimate',
  };

  const periodNames: Record<number, string> = {
    7: 'Weekly',
    14: 'Bi-weekly',
  };

  const totalMatches = (league.participantIds.length * (league.participantIds.length - 1) / 2) * league.roundsPerOpponent;
  const displayStatus = getLeagueDisplayStatus(league);

  return (
    <div className="options-tab">
      <div className="card">
        <div className="options-header">
          <h3>League Options</h3>
          <span className="options-subtitle">
            Configuration used to create this league
          </span>
        </div>

        <div className="options-grid">
          <div className="option-card">
            <div className="option-label">League Name</div>
            <div className="option-value">{league.name}</div>
          </div>

          <div className="option-card">
            <div className="option-label">Game</div>
            <div className="option-value">{gameNames[league.gameId] || league.gameId}</div>
          </div>

          <div className="option-card">
            <div className="option-label">Participants</div>
            <div className="option-value">{league.participantIds.length}</div>
          </div>

          <div className="option-card">
            <div className="option-label">Total Matches</div>
            <div className="option-value">{totalMatches}</div>
          </div>

          <div className="option-card">
            <div className="option-label">Rounds per Opponent</div>
            <div className="option-value">{league.roundsPerOpponent} {league.roundsPerOpponent === 1 ? 'time' : 'times'}</div>
          </div>

          <div className="option-card">
            <div className="option-label">Games per Match</div>
            <div className="option-value">Best of {league.gamesPerMatch}</div>
          </div>

          <div className="option-card">
            <div className="option-label">Matches per Player per Period</div>
            <div className="option-value">{league.matchesPerPlayerPerPeriod}</div>
          </div>

          <div className="option-card">
            <div className="option-label">Period Frequency</div>
            <div className="option-value">{periodNames[league.periodDays] || `${league.periodDays} days`}</div>
          </div>

          <div className="option-card">
            <div className="option-label">Start Date</div>
            <div className="option-value">{new Date(league.startDate).toLocaleDateString()}</div>
          </div>

          <div className="option-card">
            <div className="option-label">No-Show Tolerance</div>
            <div className="option-value">{league.maxNoShowsBeforeKick} before kick</div>
          </div>

          <div className="option-card">
            <div className="option-label">Playoffs</div>
            <div className="option-value">
              {league.playoffsEnabled ? `Enabled (Top 8, ${league.playoffsEloMultiplier}x ELO)` : 'Disabled'}
            </div>
          </div>

          <div className="option-card">
            <div className="option-label">Status</div>
            <div className={`option-value status-badge status-${displayStatus}`}>
              {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
            </div>
          </div>
        </div>

        <div className="options-elo-section">
          <h4>ELO System</h4>
          <p>
            League matches use the same ELO engine as the ranking system. 
            The K-factor is determined by the winner's current ELO rank, 
            so upsets against higher-rated players grant more points and 
            top-tier wins grant fewer points.
          </p>
          <ul>
            <li>Victories update both players' ELO immediately</li>
            <li>No-shows penalize the absent player as a normal loss</li>
            <li>The present player in a no-show does not gain ELO</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default LeagueOptionsTab;
