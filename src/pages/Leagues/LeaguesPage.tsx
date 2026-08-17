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
          <h1>🏆 Leagues</h1>
          <button className="btn-primary" onClick={() => navigate('/leagues/create')}>
            + Create League
          </button>
        </div>

        {leagues.length === 0 ? (
          <div className="empty-state card">
            <h3>No leagues yet</h3>
            <p className="text-secondary">Create your first league to start tracking matches and rankings.</p>
            <button className="btn-primary mt-2" onClick={() => navigate('/leagues/create')}>
              + Create League
            </button>
          </div>
        ) : (
          <div className="leagues-grid">
            {leagues.map((league) => {
              const game = getGame(league.gameId);
              const statusColor = league.status === 'active' ? 'var(--primary-color)' : 'var(--text-tertiary)';

              return (
                <div
                  key={league.id}
                  className="league-card card"
                  onClick={() => navigate(`/leagues/${league.id}`)}
                >
                  <div className="league-card-header">
                    <h3 className="league-card-title">{league.name}</h3>
                    <span className="league-card-status" style={{ color: statusColor }}>
                      {league.status === 'active' ? '● Active' : '○ Completed'}
                    </span>
                  </div>

                  <div className="league-card-meta">
                    <div className="league-card-meta-item">
                      <span className="meta-label">Game</span>
                      <span className="meta-value">{game?.shortName || league.gameId}</span>
                    </div>
                    <div className="league-card-meta-item">
                      <span className="meta-label">Players</span>
                      <span className="meta-value">{league.participantIds.length}</span>
                    </div>
                    <div className="league-card-meta-item">
                      <span className="meta-label">Week</span>
                      <span className="meta-value">{league.currentWeek}</span>
                    </div>
                  </div>

                  <div className="league-card-footer">
                    <span className="league-card-date">
                      Started {new Date(league.startDate).toLocaleDateString()}
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
