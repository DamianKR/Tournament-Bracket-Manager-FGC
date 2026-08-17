import { LeagueStanding, GlobalParticipant } from '@/models/types';
import { useNavigate } from 'react-router-dom';
import './LeagueStandingsTab.css';

interface LeagueStandingsTabProps {
  standings: LeagueStanding[];
  participants: Map<string, GlobalParticipant>;
  playoffsEnabled: boolean;
}

function LeagueStandingsTab({ standings, participants, playoffsEnabled }: LeagueStandingsTabProps) {
  const navigate = useNavigate();

  function getParticipantName(id: string): string {
    const p = participants.get(id);
    return p ? (p.alias?.trim() || p.name) : 'Unknown';
  }

  function formatEloChange(change: number): string {
    if (change === 0) return '±0';
    return change > 0 ? `+${change}` : `${change}`;
  }

  return (
    <div className="standings-tab">
      <div className="card">
        <div className="standings-header">
          <h3>Standings</h3>
          {playoffsEnabled && (
            <span className="playoffs-note"><i className="fas fa-trophy" /> Top 8 qualify for playoffs</span>
          )}
        </div>

        <div className="standings-table-wrapper">
          <table className="standings-table">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-player">Player</th>
                <th className="col-stat">MP</th>
                <th className="col-stat">W</th>
                <th className="col-stat">L</th>
                <th className="col-stat">ELO</th>
                <th className="col-stat">Change</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => {
                const isPlayoffQualified = playoffsEnabled && s.rank <= 8;
                return (
                  <tr
                    key={s.participantId}
                    className={`standing-row ${isPlayoffQualified ? 'playoff-qualified' : ''}`}
                    onClick={() => navigate(`/participants/${s.participantId}`)}
                  >
                    <td className="col-rank">
                      <span className={`rank-badge rank-${s.rank}`}>
                        {s.rank === 1 && '🥇'}
                        {s.rank === 2 && '🥈'}
                        {s.rank === 3 && '🥉'}
                        {s.rank > 3 && s.rank}
                      </span>
                    </td>
                    <td className="col-player">
                      <div className="player-cell">
                        <span className="player-name">{getParticipantName(s.participantId)}</span>
                        {s.noShows > 0 && (
                          <span className="no-show-badge" title={`${s.noShows} no-shows`}>
                            <i className="fas fa-exclamation-triangle" /> {s.noShows}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="col-stat">{s.matchesPlayed}</td>
                    <td className="col-stat text-success">{s.wins}</td>
                    <td className="col-stat text-danger">{s.losses}</td>
                    <td className="col-stat font-bold">{s.currentElo}</td>
                    <td className={`col-stat ${s.eloChange >= 0 ? 'text-success' : 'text-danger'}`}>
                      {formatEloChange(s.eloChange)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {standings.length === 0 && (
          <div className="empty-standings">
            <p className="text-secondary">No matches played yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LeagueStandingsTab;
