import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { League } from '@/models/league';
import { getAllLeagues, deleteLeague, getLeagueDisplayStatus } from '@/services/leagues/leagueService';
import { getGame } from '@/data/games';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import Loading from '@/components/Loading/Loading';
import './LeaguesPage.css';

function LeaguesPage() {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadLeagues();
  }, []);

  async function loadLeagues() {
    setLoading(true);
    const data = await getAllLeagues();
    setLeagues(data);
    setLoading(false);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const ok = await deleteLeague(deleteTarget.id);
    setDeleteTarget(null);
    if (ok) loadLeagues();
  }

  if (loading) {
    return (
      <div className="leagues-page">
        <div className="container">
          <Loading message="Loading leagues..." />
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
              const displayStatus = getLeagueDisplayStatus(league);
              const statusClass = `status-${displayStatus}`;

              return (
                <div
                  key={league.id}
                  className="league-card card"
                  onClick={() => navigate(`/events/leagues/${league.id}`)}
                >
                  <div className="league-card-header">
                    <h3 className="league-card-title">{league.name}</h3>
                    <span className={`league-card-status ${statusClass}`}>
                      {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
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
                    <button
                      className="league-card-delete"
                      title="Delete league"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: league.id, name: league.name });
                      }}
                    >
                      <i className="fas fa-trash-alt" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete League"
        message={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This cannot be undone.`}
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default LeaguesPage;
