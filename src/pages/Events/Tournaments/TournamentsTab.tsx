import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tournament } from '@/models/types';
import { getAllTournaments, removeTournament } from '@/services/tournament/tournamentService';
import { loadTournamentsAsync, saveTournaments } from '@/services/storage/localStorage';

import { useCommunity } from '@/contexts/CommunityContext';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import './TournamentsTab.css';

function TournamentsTab() {
  const { t } = useTranslation();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminCurrentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;

  useEffect(() => {
    // Show localStorage immediately (instant), then refresh from server
    const cached = getAllTournaments(communityId);
    applySort(cached);
    loadTournamentsAsync(communityId).then((serverData) => {
      // If server returned empty but localStorage has data → push localStorage to server
      if (serverData.length === 0 && cached.length > 0) {
        saveTournaments(cached);
        applySort(cached);
      } else {
        applySort(serverData);
      }
    });
  }, [communityId]);

  const applySort = (data: Tournament[]) => {
    const sorted = [...data].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    setTournaments(sorted);
  };

  const handleCreateNew = () => {
    navigate(getPath('events/tournaments/create'));
  };

  const handleOpenTournament = (id: string) => {
    const tournament = tournaments.find(t => t.id === id);
    if (tournament?.status === 'setup') {
      navigate(getPath(`events/tournaments/create/${id}`));
    } else {
      navigate(getPath(`events/tournaments/${id}`));
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
    applySort(getAllTournaments(communityId));
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
    const badges: Record<string, { label: string; className: string }> = {
      setup: { label: t('tournaments.status.setup'), className: 'status-setup' },
      in_progress: { label: t('tournaments.status.in_progress'), className: 'status-progress' },
      completed: { label: t('tournaments.status.completed'), className: 'status-completed' },
    };

    const badge = badges[status] || badges.setup;

    return <span className={`status-badge ${badge.className}`}>{badge.label}</span>;
  };

  return (
    <div className="tournaments-tab">
      <div className="tournaments-header">
        <div>
          <h1><i className="fas fa-trophy" /> {t('tournaments.title')}</h1>
          <p className="text-secondary">{t('tournaments.subtitle')}</p>
        </div>
        {canAdminCurrentCommunity && (
          <button className="btn-primary" onClick={handleCreateNew}>
            <i className="fas fa-plus" /> {t('tournaments.newTournament')}
          </button>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="empty-state card">
          <h3>{t('tournaments.emptyTitle')}</h3>
          <p className="text-secondary">{t('tournaments.emptyDesc')}</p>
          {canAdminCurrentCommunity && (
            <button className="btn-primary mt-2" onClick={handleCreateNew}>
              {t('tournaments.createTournament')}
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
                  <span><i className="fas fa-users" /> {t('tournaments.participants')}</span>
                  <span>{tournament.participants.length}</span>
                </div>
                <div className="info-row">
                  <span><i className="fas fa-sitemap" /> {t('tournaments.mode')}</span>
                  <span>
                    {tournament.mode === 'double_elimination'
                      ? t('tournaments.doubleElimination')
                      : t('tournaments.singleElimination')}
                  </span>
                </div>
                <div className="info-row">
                  <span><i className="fas fa-clock" /> {t('tournaments.lastUpdated')}</span>
                  <span className="text-sm">{formatDate(tournament.updatedAt)}</span>
                </div>
              </div>

              <div className="tournament-card-actions">
                <button
                  className="btn-outline"
                  onClick={() => tournament.status === 'setup' ? navigate(getPath(`events/tournaments/create/${tournament.id}`)) : navigate(getPath(`events/tournaments/${tournament.id}`))}
                >
                  <i className={tournament.status === 'setup' ? 'fas fa-pen' : 'fas fa-eye'} />
                  {tournament.status === 'setup' ? ` ${t('tournaments.continueSetup')}` : ` ${t('tournaments.viewBracket')}`}
                </button>
                {canAdminCurrentCommunity && (
                  <button
                    className="btn-danger btn-sm"
                    onClick={(e) => requestDelete(tournament.id, e)}
                    title={t('tournaments.delete')}
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
        title={t('tournaments.deleteTitle')}
        message={deleteTarget ? t('tournaments.deleteMessage', { name: deleteTarget.name }) : ''}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
        confirmText={t('notifications.delete')}
      />
    </div>
  );
}

export default TournamentsTab;
