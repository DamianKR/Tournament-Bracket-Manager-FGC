import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { League } from '@/models/league';
import { getAllLeagues, deleteLeague, getLeagueDisplayStatus } from '@/services/leagues/leagueService';
import { getGame } from '@/data/games';
import { useCommunity } from '@/contexts/CommunityContext';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import Loading from '@/components/Loading/Loading';
import './LeaguesTab.css';

function LeaguesTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminCurrentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadLeagues();
  }, [communityId]);

  async function loadLeagues() {
    setLoading(true);
    const data = await getAllLeagues(communityId);
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
      <div className="leagues-tab">
        <Loading message={t('leagues.loading')} />
      </div>
    );
  }

  return (
    <div className="leagues-tab">
      <div className="leagues-header">
        <div>
          <h1><i className="fas fa-shield-alt" /> {t('leagues.title')}</h1>
          <p className="text-secondary">{t('leagues.subtitle')}</p>
        </div>
        {canAdminCurrentCommunity && (
          <button className="btn-primary" onClick={() => navigate(getPath('events/leagues/create'))}>
            <i className="fas fa-plus" /> {t('leagues.newLeague')}
          </button>
        )}
      </div>

      {leagues.length === 0 ? (
        <div className="empty-state card">
          <h3>{t('leagues.emptyTitle')}</h3>
          <p className="text-secondary">{t('leagues.emptyDesc')}</p>
          {canAdminCurrentCommunity && (
            <button className="btn-primary mt-2" onClick={() => navigate(getPath('events/leagues/create'))}>
              <i className="fas fa-plus" /> {t('leagues.newLeague')}
            </button>
          )}
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
                onClick={() => navigate(getPath(`events/leagues/${league.id}`))}
              >
                <div className="league-card-header">
                  <h3 className="league-card-title">{league.name}</h3>
                  <span className={`league-card-status ${statusClass}`}>
                    {t(`leagues.status.${displayStatus}` as any)}
                  </span>
                </div>

                <div className="league-card-meta">
                  <div className="info-row">
                    <span>{t('leagues.game')}</span>
                    <span>{game?.shortName || league.gameId}</span>
                  </div>
                  <div className="info-row">
                    <span>{t('leagues.players')}</span>
                    <span>{league.participantIds.length}</span>
                  </div>
                  <div className="info-row">
                    <span>{t('leagues.week')}</span>
                    <span>{league.currentWeek}</span>
                  </div>
                  <div className="info-row">
                    <span>{t('leagues.format')}</span>
                    <span>{t('leagues.bestOf', { count: league.gamesPerMatch })}</span>
                  </div>
                </div>

                <div className="league-card-actions">
                  <button
                    className="btn-outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(getPath(`events/leagues/${league.id}`));
                    }}
                  >
                    <i className="fas fa-eye" /> {t('leagues.viewLeague')}
                  </button>
                  {canAdminCurrentCommunity && (
                    <button
                      className="btn-danger btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: league.id, name: league.name });
                      }}
                      title={t('leagues.delete')}
                    >
                      <i className="fas fa-trash" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('leagues.deleteTitle')}
        message={deleteTarget ? t('leagues.deleteMessage', { name: deleteTarget.name }) : ''}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        confirmText={t('notifications.delete')}
      />
    </div>
  );
}

export default LeaguesTab;
