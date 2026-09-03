import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { getCommunity, updateCommunity } from '@/services/communities/communityService';
import { getAllParticipantsAsync } from '@/services/participants/participantService';
import { getAllTournaments } from '@/services/tournament/tournamentService';
import { getAllLeagues } from '@/services/leagues/leagueService';
import { getLeaderboard, type LeaderboardEntry } from '@/services/ranking/rankingService';
import type { Community } from '@/models/community';
import type { GlobalParticipant, Tournament } from '@/models/types';
import type { League } from '@/models/league';
import './CommunityDashboard.css';

export default function CommunityDashboard() {
  const { communityId } = useParams<{ communityId: string }>();
  const { t } = useTranslation();
  const { allCommunities, setCommunityId, canAdminCurrentCommunity, refresh } = useCommunity();
  const { user } = useAuth();
  const [community, setCommunity] = useState<Community | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editShort, setEditShort] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [participants, setParticipants] = useState<GlobalParticipant[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [topRanked, setTopRanked] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!communityId) return;
    setCommunityId(communityId);

    const fromList = allCommunities.find((c) => c.id === communityId);
    const resolved = fromList ?? null;
    setCommunity(resolved);

    (async () => {
      try {
        const [p, t, l, board] = await Promise.all([
          getAllParticipantsAsync(communityId),
          getAllTournaments(communityId),
          getAllLeagues(communityId),
          getLeaderboard(communityId),
        ]);
        setParticipants(p);
        setTournaments(t);
        setLeagues(l);
        setTopRanked(board.slice(0, 5));
      } catch (err) {
        console.error('[CommunityDashboard] Failed to load stats:', err);
      } finally {
        setLoading(false);
      }

      if (!fromList) {
        getCommunity(communityId)
          .then((c) => setCommunity(c))
          .catch(() => setCommunity(null));
      }
    })();
  }, [communityId, allCommunities, setCommunityId]);

  if (loading) return <div className="community-dashboard">{t('common.loading')}</div>;
  if (!community) return <div className="community-dashboard not-found">{t('communityDashboard.notFound')}</div>;

  const displayName = community.name;
  const isMyCommunity = user?.communityId === communityId || user?.role === 'superadmin';

  const activeTournaments = tournaments.filter(t => t.status !== 'completed');
  const activeLeagues = leagues.filter(l => l.status === 'active');

  function openEdit() {
    if (!community) return;
    setEditName(community.name);
    setEditShort(community.shortName ?? '');
    setEditDesc(community.description ?? '');
    setEditError('');
    setEditOpen(true);
  }

  async function handleSaveCommunity(e: React.FormEvent) {
    e.preventDefault();
    if (!community || !communityId) return;
    if (!editName.trim() || !editShort.trim()) {
      setEditError(t('communityDashboard.errors.requiredFields'));
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const updated = await updateCommunity(communityId, editName.trim(), editShort.trim(), editDesc.trim());
      setCommunity(updated);
      await refresh();
      setEditOpen(false);
    } catch (err: any) {
      setEditError(err.message || t('communityDashboard.errors.save'));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="community-dashboard">
      <section className="community-hero">
        <div className="container">
          <h1 className="community-title">{displayName}</h1>
          {community.shortName && (
            <p className="cd-short-name">{community.shortName}</p>
          )}
          <p className="community-subtitle">
            {community.description || t('communityDashboard.communityHome')}
            {isMyCommunity && user?.role !== 'superadmin' && (
              <> — <span className="cd-my-community">{t('communityDashboard.myCommunity')}</span></>
            )}
          </p>
          {canAdminCurrentCommunity && (
            <div className="cd-hero-actions">
              <button className="cd-hero-edit-btn" onClick={openEdit}>
                <i className="fas fa-edit" />
                <span>{t('communityDashboard.editCommunity')}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {editOpen && (
        <section className="community-section cd-edit-section">
          <div className="container">
            <div className="card cd-edit-card">
              <h3 className="cd-edit-title">{t('communityDashboard.editTitle')}</h3>
              {editError && <div className="cd-edit-error">{editError}</div>}
              <form onSubmit={handleSaveCommunity} className="cd-edit-form">
                <div className="cd-edit-fields">
                  <div className="form-group">
                    <label htmlFor="cd-edit-name">{t('communityDashboard.name')}</label>
                    <input
                      id="cd-edit-name"
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="cd-edit-short">{t('communityDashboard.shortName')}</label>
                    <input
                      id="cd-edit-short"
                      type="text"
                      value={editShort}
                      onChange={(e) => setEditShort(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group cd-edit-desc">
                    <label htmlFor="cd-edit-desc">{t('communityDashboard.description')}</label>
                    <textarea
                      id="cd-edit-desc"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <div className="cd-edit-actions">
                  <button type="button" className="btn-outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
                    {t('communityDashboard.cancel')}
                  </button>
                  <button type="submit" className="btn-primary" disabled={editSaving}>
                    {editSaving ? t('communityDashboard.saving') : t('communityDashboard.saveChanges')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      )}

      <section className="community-section cd-stats-section">
        <div className="container">
          <div className="cd-section-intro">
            <h2 className="community-section-title">{t('communityDashboard.statusTitle')}</h2>
            <p className="cd-section-description">
              {t('communityDashboard.statusDescription', { name: displayName })}
            </p>
          </div>
          <div className="cd-stats-grid">
            <div className="cd-stat card">
              <i className="fas fa-users cd-stat-icon" />
              <span className="cd-stat-value">{participants.length}</span>
              <span className="cd-stat-label">{t('communityDashboard.participants')}</span>
            </div>
            <div className="cd-stat card">
              <i className="fas fa-trophy cd-stat-icon" />
              <span className="cd-stat-value">{tournaments.length}</span>
              <span className="cd-stat-label">{t('communityDashboard.tournaments')}</span>
            </div>
            <div className="cd-stat card">
              <i className="fas fa-calendar-alt cd-stat-icon" />
              <span className="cd-stat-value">{leagues.length}</span>
              <span className="cd-stat-label">{t('communityDashboard.leagues')}</span>
            </div>
            <div className="cd-stat card">
              <i className="fas fa-bolt cd-stat-icon" />
              <span className="cd-stat-value">{activeLeagues.length + activeTournaments.length}</span>
              <span className="cd-stat-label">{t('communityDashboard.active')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="community-section">
        <div className="container cd-two-columns">
          <div className="cd-main">
            <div className="cd-section-intro cd-section-intro--left">
              <h2 className="community-section-title">{t('communityDashboard.zonesTitle')}</h2>
              <p className="cd-section-description">
                {t('communityDashboard.zonesDescription', { name: displayName })}
              </p>
            </div>
            <div className="community-cards">
              <Link to="events" className="community-card card">
                <i className="fas fa-trophy" />
                <h3>{t('communityDashboard.tournaments')}</h3>
                <p>{activeTournaments.length} {t('communityDashboard.active').toLowerCase()} · {tournaments.length} total</p>
              </Link>
              <Link to="events?tab=leagues" className="community-card card">
                <i className="fas fa-calendar-alt" />
                <h3>{t('communityDashboard.leagues')}</h3>
                <p>{activeLeagues.length} {t('communityDashboard.active').toLowerCase()} · {leagues.length} total</p>
              </Link>
              <Link to="events?tab=ranked" className="community-card card">
                <i className="fas fa-khanda" />
                <h3>{t('dashboard.duels')}</h3>
                <p>{t('dashboard.duelsDesc')}</p>
              </Link>
              <Link to="ranking" className="community-card card">
                <i className="fas fa-list-ol" />
                <h3>{t('header.ranking')}</h3>
                <p>{t('dashboard.rankingDesc')}</p>
              </Link>
              <Link to="participants" className="community-card card">
                <i className="fas fa-users" />
                <h3>{t('communityDashboard.participants')}</h3>
                <p>{participants.length} {t('communityDashboard.players')}</p>
              </Link>
            </div>

            {(activeTournaments.length > 0 || activeLeagues.length > 0) && (
              <>
                <div className="cd-section-intro cd-section-intro--left">
                  <h2 className="community-section-title">{t('communityDashboard.activeEventsTitle')}</h2>
                  <p className="cd-section-description">
                    {t('communityDashboard.activeEventsDescription')}
                  </p>
                </div>
                <div className="cd-active-list">
                  {activeTournaments.map(tournament => (
                    <Link to={`events/tournaments/${tournament.id}`} key={tournament.id} className="cd-active-item card">
                      <span className="cd-active-icon"><i className="fas fa-trophy" /></span>
                      <span className="cd-active-name">{tournament.name}</span>
                      <span className="cd-active-status">{t('tournament.status.' + tournament.status)}</span>
                    </Link>
                  ))}
                  {activeLeagues.map(l => (
                    <Link to={`events/leagues/${l.id}`} key={l.id} className="cd-active-item card">
                      <span className="cd-active-icon"><i className="fas fa-calendar-alt" /></span>
                      <span className="cd-active-name">{l.name}</span>
                      <span className="cd-active-status">{t('leagues.status.' + l.status)}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>

          <aside className="cd-sidebar">
            <div className="cd-section-intro">
              <h2 className="community-section-title">{t('communityDashboard.topRanking')}</h2>
              <p className="cd-section-description">
                {t('communityDashboard.topRankingDescription', { name: displayName })}
              </p>
            </div>
            {topRanked.length > 0 ? (
              <ol className="cd-top-ranking">
                {topRanked.map((e, i) => (
                  <li key={e.id} className="cd-top-rank-item">
                    <span className="cd-top-position">{i + 1}</span>
                    <span className="cd-top-name" title={e.name}>{e.alias || e.name}</span>
                    <span className="cd-top-points">{e.eloPoints ?? '—'}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-secondary">{t('communityDashboard.noRanked')}</p>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
