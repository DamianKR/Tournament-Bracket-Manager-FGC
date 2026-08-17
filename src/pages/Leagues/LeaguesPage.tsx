import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { League } from '@/models/league';
import { getAllLeagues } from '@/services/leagues/leagueService';
import { getGame } from '@/data/games';
import './LeaguesPage.css';

function LeaguesPage() {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeagues();
  }, []);

  async function loadLeagues() {
    setLoading(true);
    const data = await getAllLeagues();
    setLeagues(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="leagues-page">
        <div className="container">
          <div className="loading-state">Loading leagues...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="leagues-page">
      <div className="container">
        <div className="leagues-header">
          <div>
            <h1><i className="fas fa-trophy" /> Leagues</h1>
            <p className="text-secondary">Seasons of round-robin matches spread across multiple weeks</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/leagues/create')}>
            <i className="fas fa-plus" /> New League
          </button>
        </div>

        {leagues.length === 0 ? (
          <div className="empty-state card">
            <h3>No leagues yet</h3>
            <p className="text-secondary">Create a round-robin league and track weekly matches and ELO standings.</p>
            <button className="btn-primary mt-2" onClick={() => navigate('/leagues/create')}>
              <i className="fas fa-plus" /> New League
            </button>
          </div>
        ) : (
          <div className="leagues-grid">
            {leagues.map((league) => {
              const game = getGame(league.gameId);
              const statusClass = league.status === 'active' ? 'status-active' : 'status-completed';

              return (
                <div
                  key={league.id}
                  className="league-card card"
                  onClick={() => navigate(`/leagues/${league.id}`)}
                >
                  <div className="league-card-header">
                    <h3 className="league-card-title">{league.name}</h3>
                    <span className={`league-card-status ${statusClass}`}>
                      {league.status === 'active' ? 'Active' : 'Completed'}
                    </span>
                  </div>

                  <div className="league-card-meta">
                    <div className="info-row">
                      <span>Game</span>
                      <span>{game?.shortName || league.gameId}</span>
                    </div>
                    <div className="info-row">
                      <span>Players</span>
                      <span>{league.participantIds.length}</span>
                    </div>
                    <div className="info-row">
                      <span>Week</span>
                      <span>{league.currentWeek}</span>
                    </div>
                    <div className="info-row">
                      <span>Format</span>
                      <span>Best of {league.gamesPerMatch}</span>
                    </div>
                  </div>

                  <div className="league-card-footer">
                    <span className="league-card-date">
                      <i className="fas fa-calendar" /> Started {new Date(league.startDate).toLocaleDateString()}
                    </span>
                    <span className="league-card-date">
                      <i className="fas fa-sync" /> Week {league.currentWeek}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaguesPage;
