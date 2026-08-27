import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tournament } from '@/models/types';
import { getAllTournaments, removeTournament } from '@/services/tournament/tournamentService';
import { loadTournamentsAsync, saveTournaments } from '@/services/storage/localStorage';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import './TournamentsTab.css';

function TournamentsTab() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  useEffect(() => {
    // Show localStorage immediately (instant), then refresh from server
    const cached = getAllTournaments();
    applySort(cached);
    loadTournamentsAsync().then((serverData) => {
      // If server returned empty but localStorage has data → push localStorage to server
      if (serverData.length === 0 && cached.length > 0) {
        saveTournaments(cached);
        applySort(cached);
      } else {
        applySort(serverData);
      }
    });
  }, []);

  const applySort = (data: Tournament[]) => {
    const sorted = [...data].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    setTournaments(sorted);
  };

  const handleCreateNew = () => {
    navigate('/events/tournaments/create');
  };

  const handleOpenTournament = (id: string) => {
    const tournament = tournaments.find(t => t.id === id);
    if (tournament?.status === 'setup') {
      navigate(`/events/tournaments/create/${id}`);
    } else {
      navigate(`/events/tournaments/${id}`);
    }
  };

  const requestDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const t = tournaments.find((t2) => t2.id === id);
    if (t) setDeleteTarget({ id, name: t.name });
  };

  const cancelDelete = () => setDeleteTarget(null);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeTournament(deleteTarget.id);
    applySort(getAllTournaments());
    setDeleteTarget(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      setup: { label: 'Setup', className: 'status-setup' },
      in_progress: { label: 'In Progress', className: 'status-progress' },
      completed: { label: 'Completed', className: 'status-completed' },
    };
    
    const badge = badges[status as keyof typeof badges] || badges.setup;
    
    return <span className={`status-badge ${badge.className}`}>{badge.label}</span>;
  };

  return (
    <div className="tournaments-tab">
      <div className="tournaments-header">
        <div>
          <h1><i className="fas fa-trophy" /> Tournaments</h1>
          <p className="text-secondary">Create and manage brackets — double elimination, single elimination and group stages supported</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={handleCreateNew}>
            <i className="fas fa-plus" /> New Tournament
          </button>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="empty-state card">
          <h3>No tournaments yet</h3>
          <p className="text-secondary">Create your first tournament to get started</p>
          {isAdmin && (
            <button className="btn-primary mt-2" onClick={handleCreateNew}>
              Create Tournament
            </button>
          )}
        </div>
      ) : (
        <div className="tournaments-grid">
          {tournaments.map(tournament => (
            <div
              key={tournament.id}
              className="tournament-card card"
              onClick={() => handleOpenTournament(tournament.id)}
            >
              <div className="tournament-card-header">
                <h3>{tournament.name}</h3>
                {getStatusBadge(tournament.status)}
              </div>
              
              <div className="tournament-card-info">
                <div className="info-row">
                  <span><i className="fas fa-users" /> Participants</span>
                  <span>{tournament.participants.length}</span>
                </div>
                <div className="info-row">
                  <span><i className="fas fa-sitemap" /> Mode</span>
                  <span>
                    {tournament.mode === 'double_elimination'
                      ? 'Double Elimination'
                      : 'Single Elimination'}
                  </span>
                </div>
                <div className="info-row">
                  <span><i className="fas fa-clock" /> Last updated</span>
                  <span className="text-sm">{formatDate(tournament.updatedAt)}</span>
                </div>
              </div>

              <div className="tournament-card-actions">
                <button
                  className="btn-outline"
                  onClick={() => tournament.status === 'setup' ? navigate(`/events/tournaments/create/${tournament.id}`) : navigate(`/events/tournaments/${tournament.id}`)}
                >
                  <i className={tournament.status === 'setup' ? 'fas fa-pen' : 'fas fa-eye'} />
                  {tournament.status === 'setup' ? ' Continue Setup' : ' View Bracket'}
                </button>
                {isAdmin && (
                  <button
                    className="btn-danger btn-sm"
                    onClick={(e) => requestDelete(tournament.id, e)}
                    title="Delete tournament"
                  >
                    <i className="fas fa-trash" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete tournament"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.` : ''}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
        confirmText="Delete"
      />
    </div>
  );
}

export default TournamentsTab;
