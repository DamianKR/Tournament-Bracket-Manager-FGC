import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { League } from '@/models/league';
import { buildLeaguesSpec, createLeaguesSource, deleteLeague, forgetLeagueRow, getLeagueDisplayStatus } from '@/services/leagues/leagueService';
import { getGame } from '@/data/games';
import { useCommunity } from '@/contexts/CommunityContext';
import { getEffectiveCurrentWeek } from '@/utils/leagueWeek';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import Loading from '@/components/Loading/Loading';
import OfflineNotice from '@/components/OfflineNotice/OfflineNotice';
import Pagination from '@/components/Pagination/Pagination';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import './LeaguesTab.css';

function LeaguesTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminCurrentCommunity, canAdminGame, communityGames } = useCommunity();
  const communityId = currentCommunity?.id;
  const [gameFilter, setGameFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  // Server pages (game filter + newest first run in the DB) over a local copy → also pages offline.
  const source = useMemo(() => (communityId ? createLeaguesSource(communityId) : null), [communityId]);
  const spec = useMemo(() => buildLeaguesSpec(gameFilter), [gameFilter]);
  const list = usePaginatedList<League>({ source, spec });

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    const ok = await deleteLeague(id);
    setDeleteTarget(null);
    if (ok) {
      if (communityId) forgetLeagueRow(communityId, id);
      list.reload();
    }
  }

  return (
    <div className="leagues-tab">
      <div className="leagues-header">
        <div>
          <h1><i className="fas fa-shield-alt" /> {t('leagues.title')}</h1>
          <p className="text-secondary">{t('leagues.subtitle')}</p>
        </div>
        <div className="leagues-header-actions">
          <select
            className="game-filter-select"
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            aria-label={t('ranking.gameLabel')}
          >
            <option value="all">{t('ranking.allGames')}</option>
            {communityGames.map((g) => (
              <option key={g.id} value={g.id} style={{ color: g.color, fontWeight: 700 }}>{g.name}</option>
            ))}
          </select>
          {canAdminCurrentCommunity && (
            <button className="btn-primary" onClick={() => navigate(getPath('events/leagues/create'))}>
              <i className="fas fa-plus" /> {t('leagues.newLeague')}
            </button>
          )}
        </div>
      </div>

      <div ref={listTopRef} />
      {list.loading && <Loading message={t('leagues.loading')} />}
      {list.unavailable && <OfflineNotice />}
      {list.incomplete && <OfflineNotice compact partial />}
      {list.error && <div className="error-message">{list.error}</div>}

      {!list.loading && !list.unavailable && !list.error && list.total === 0 && (
        gameFilter === 'all' ? (
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
          <div className="empty-state card">
            <h3>{t('leagues.emptyTitle')}</h3>
            <p className="text-secondary">{t('history.noMatchesForGame', { defaultValue: 'No leagues for this game' })}</p>
          </div>
        )
      )}

      {list.items.length > 0 && (
        <div className="leagues-grid">
          {list.items.map((league) => {
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
                    <span style={{ color: game?.color, fontWeight: 700 }}>{game?.shortName || league.gameId}</span>
                  </div>
                  <div className="info-row">
                    <span>{t('leagues.players')}</span>
                    <span>{league.participantIds.length}</span>
                  </div>
                  <div className="info-row">
                    <span>{t('leagues.week')}</span>
                    <span>{getEffectiveCurrentWeek(league)}</span>
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
                  {canAdminGame(league.gameId) && (
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

      <Pagination {...list.paginationProps} scrollRef={listTopRef} />

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
