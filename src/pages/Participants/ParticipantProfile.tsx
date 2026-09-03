import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { GlobalParticipant, ComputedStats, LeagueResultEntry, MatchRecord } from '@/models/types';
import type { AuthUser } from '@/models/auth';
import {
  getParticipant,
  computeStats,
  updateParticipant,
  removeParticipant,
  getParticipantLeagueStats,
  getAllParticipantsAsync,
  type LeagueStatsSummary,
} from '@/services/participants/participantService';
import { loadTournamentsForParticipantAsync } from '@/services/storage/localStorage';
import { getAllTournamentMatchesAsync } from '@/services/tournament/tournamentService';
import { getAllMatches } from '@/services/ranking/rankingService';
import { initials, avatarColor } from './ParticipantsPage';
import CharacterSelect from '@/components/CharacterSelect/CharacterSelect';
import { getCharacter, getGame } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import { getLeaderboard, getRankColor, getRankIcon, type LeaderboardEntry } from '@/services/ranking/rankingService';
import { getDuelStats, getDuelSettingsAsync, getNextWeeklyReset, formatTimeUntilReset } from '@/services/duels/duelService';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { changeMyPassword, listUsers, updateUserAccount, deleteUserAccount } from '@/services/auth/authService';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import Loading from '@/components/Loading/Loading';
import './ParticipantProfile.css';

type Tab = 'overview' | 'results' | 'matches' | 'edit';
type MatchTypeFilter = 'all' | 'tournament' | 'league' | 'duel';
type MatchResultFilter = 'all' | 'wins' | 'losses';

const PLACEMENT_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ParticipantProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminCurrentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;
  const [searchParams] = useSearchParams();
  const { user, isAdmin, isCommunityOwner, isSuperAdmin } = useAuth();
  const isOwnProfile = !!(user && user.participantId === id);
  // Can edit profile fields only if in own community AND has admin rights, or is own profile
  const canEdit = (canAdminCurrentCommunity) || isOwnProfile;
  // Can manage other people's accounts only if community owner AND in own community
  const canManageAccounts = canAdminCurrentCommunity && isCommunityOwner;

  // Role options a manager can assign, restricted by their own role
  const manageableRoles: AuthUser['role'][] = isSuperAdmin
    ? ['user', 'admin', 'community_admin', 'superadmin']
    : isCommunityOwner
      ? ['user', 'admin']
      : [];

  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'overview';

  const [participant, setParticipant] = useState<GlobalParticipant | null>(null);
  const [stats, setStats] = useState<ComputedStats | null>(null);
  const [leagueStats, setLeagueStats] = useState<LeagueStatsSummary | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab === 'edit' && canEdit ? 'edit' : 'overview');
  const [resultsSubTab, setResultsSubTab] = useState<'tournaments' | 'leagues'>('tournaments');
  const [notFound, setNotFound] = useState(false);
  const [rankEntry, setRankEntry] = useState<LeaderboardEntry | null>(null);
  const [duelStats, setDuelStats] = useState({
    challengesThisWeek: 0,
    maxChallengesPerWeek: 10,
    pendingChallenges: 0,
    completedThisWeek: 0,
    totalDuels: 0,
    duelWins: 0,
    duelLosses: 0,
    duelWinRate: 0,
  });
  const [nextResetText, setNextResetText] = useState('');

  // Matches tab
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchTypeFilter, setMatchTypeFilter] = useState<MatchTypeFilter>('all');
  const [matchResultFilter, setMatchResultFilter] = useState<MatchResultFilter>('all');

  const completedLeagues = leagueStats?.leagues.filter((l) => l.status === 'completed') ?? [];
  const leagueFirstPlaces = completedLeagues.filter((l) => l.rank === 1).length;
  const leagueTop5 = completedLeagues.filter((l) => l.rank <= 5).length;
  const leaguesWithMatches = leagueStats?.leagues.filter((l) => l.matchesPlayed > 0).length ?? 0;

  // Edit state
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [editGameId, setEditGameId] = useState<string | null>(null);
  const [editCharacterId, setEditCharacterId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);

  // Password change (solo propio perfil)
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  // Admin account management
  const [linkedUser, setLinkedUser] = useState<AuthUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [admUsername, setAdmUsername] = useState('');
  const [admPassword, setAdmPassword] = useState('');
  const [admConfirm, setAdmConfirm] = useState('');
  const [admRole, setAdmRole] = useState<AuthUser['role']>('user');
  const [admIsActive, setAdmIsActive] = useState(true);
  const [admError, setAdmError] = useState('');
  const [admSuccess, setAdmSuccess] = useState(false);
  const [admSaving, setAdmSaving] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  useEffect(() => {
    if (!id || !communityId) return;
    (async () => {
      try {
        const [tournaments, ls] = await Promise.all([
          loadTournamentsForParticipantAsync(id),
          getParticipantLeagueStats(id),
        ]);
        const p = getParticipant(id, communityId);
        if (!p) { setNotFound(true); return; }
        setParticipant(p);
        setStats(computeStats(p, tournaments));
        setLeagueStats(ls);
        setEditName(p.name);
        setEditAlias(p.alias ?? '');
        setEditGameId(p.gameId ?? null);
        setEditCharacterId(p.mainCharacterId ?? null);
        setEditPhone(p.phoneNumber ?? '');
      } catch {
        const p = getParticipant(id, communityId);
        if (!p) { setNotFound(true); return; }
        setParticipant(p);
        setStats(computeStats(p));
        setLeagueStats({ leagues: [], totalMatches: 0, totalWins: 0, totalLosses: 0, winRate: 0 });
      }

      // Load ELO ranking entry (fire-and-forget — graceful if server is down)
      getLeaderboard(communityId).then((board) => {
        const entry = board.find((e) => e.id === id) ?? null;
        setRankEntry(entry);
      }).catch(() => {});

      // Load duel stats
      getDuelStats(id, communityId).then(dStats => {
        setDuelStats(dStats);
      });

      // Load next reset time
      getDuelSettingsAsync(communityId).then(settings => {
        const nextReset = getNextWeeklyReset(settings);
        setNextResetText(formatTimeUntilReset(nextReset));
      });
    })();
  }, [id, communityId]);

  // Load matches when Matches tab is opened
  useEffect(() => {
    if (tab === 'matches' && id && communityId && allMatches.length === 0) {
      loadMatches();
    }
  }, [tab, id, communityId]);

  // Load linked user account (admin only)
  useEffect(() => {
    if (!id || !isAdmin) return;
    loadLinkedUser();
  }, [id, isAdmin]);

  async function loadLinkedUser() {
    if (!id) return;
    setLoadingUser(true);
    try {
      const all = await listUsers();
      const u = all.find(x => x.participantId === id) ?? null;
      setLinkedUser(u);
      if (u) {
        setAdmUsername(u.username);
        setAdmPassword('');
        setAdmConfirm('');
        setAdmRole(u.role);
        setAdmIsActive(u.isActive);
      } else {
        setAdmUsername('');
        setAdmPassword('');
        setAdmConfirm('');
        setAdmRole('user');
        setAdmIsActive(true);
      }
      setAdmError('');
    } catch {
      setLinkedUser(null);
    } finally {
      setLoadingUser(false);
    }
  }

  async function loadMatches() {
    if (!id || !communityId) return;
    setLoadingMatches(true);
    try {
      const [tournamentMatches, rankedMatches, allParticipants] = await Promise.all([
        getAllTournamentMatchesAsync(communityId),
        getAllMatches(communityId),
        getAllParticipantsAsync(communityId).then(data => data.length > 0 ? data : []),
      ]);

      const participantMap = new Map(allParticipants.map((p: GlobalParticipant) => [p.id, p]));

      // Filter and unify matches for this participant
      const unified = [
        ...tournamentMatches
          .filter((m: any) => m.player1GlobalId === id || m.player2GlobalId === id)
          .map((m: any) => {
            const gP1 = m.player1GlobalId ? participantMap.get(m.player1GlobalId) : null;
            const gP2 = m.player2GlobalId ? participantMap.get(m.player2GlobalId) : null;
            const player1IsWinner = m.winnerId === m.player1Id;

            return {
              id: m.id,
              type: 'tournament' as const,
              player1Id: gP1?.id ?? m.player1GlobalId ?? m.player1Id,
              player2Id: gP2?.id ?? m.player2GlobalId ?? m.player2Id,
              winnerId: player1IsWinner
                ? (gP1?.id ?? m.winnerGlobalId ?? m.winnerId)
                : (gP2?.id ?? m.winnerGlobalId ?? m.winnerId),
              player1Name: gP1 ? `${gP1.name}${gP1.alias ? ` (${gP1.alias})` : ''}` : (m.player1Name || t('tournament.bracket.unknown')),
              player2Name: gP2 ? `${gP2.name}${gP2.alias ? ` (${gP2.alias})` : ''}` : (m.player2Name || t('tournament.bracket.unknown')),
              date: m.createdAt,
              context: m.tournamentName,
            };
          }),
        ...rankedMatches
          .filter((m: MatchRecord) => m.playerAId === id || m.playerBId === id)
          .map((m: MatchRecord) => ({
            id: m.id,
            type: (m.type as 'duel' | 'matchmaking' | 'free') ?? 'duel',
            player1Id: m.playerAId,
            player2Id: m.playerBId,
            winnerId: m.winnerId,
            player1Name: participantMap.get(m.playerAId) ? `${participantMap.get(m.playerAId)!.name}${participantMap.get(m.playerAId)!.alias ? ` (${participantMap.get(m.playerAId)!.alias})` : ''}` : t('tournament.bracket.unknown'),
            player2Name: participantMap.get(m.playerBId) ? `${participantMap.get(m.playerBId)!.name}${participantMap.get(m.playerBId)!.alias ? ` (${participantMap.get(m.playerBId)!.alias})` : ''}` : t('tournament.bracket.unknown'),
            player1EloBefore: m.playerAPointsBefore,
            player2EloBefore: m.playerBPointsBefore,
            player1EloAfter: m.playerAPointsAfter,
            player2EloAfter: m.playerBPointsAfter,
            player1EloChange: m.playerADelta,
            player2EloChange: m.playerBDelta,
            date: m.createdAt,
          })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setAllMatches(unified);
    } catch (err) {
      console.error('Failed to load matches:', err);
    } finally {
      setLoadingMatches(false);
    }
  }

  async function handleSave() {
    if (!participant) return;
    setSaving(true); setEditError(''); setEditSuccess(false);
    try {
      const updated = await updateParticipant(participant.id, {
        name: editName,
        alias: editAlias,
        gameId: editGameId,
        mainCharacterId: editCharacterId,
        phoneNumber: editPhone || null,
      });
      setParticipant(updated);
      setStats(computeStats(updated));
      setEditSuccess(true);
      setTab('overview');
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (pwNew.length < 6) { setPwError(t('participantProfile.errors.passwordTooShort')); return; }
    if (pwNew !== pwConfirm) { setPwError(t('participantProfile.errors.passwordsMismatch')); return; }
    setPwSaving(true); setPwError(''); setPwSuccess(false);
    try {
      await changeMyPassword(pwCurrent, pwNew);
      setPwSuccess(true);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (err: any) {
      setPwError(err.message || t('participantProfile.errors.passwordChangeFailed'));
    } finally {
      setPwSaving(false);
    }
  }

  async function handleSaveAdminAccount() {
    if (!linkedUser || !participant) return;
    if (!admUsername.trim()) { setAdmError(t('participantProfile.errors.usernameRequired')); return; }
    if (admPassword.trim() && admPassword.trim().length < 6) { setAdmError(t('participantProfile.errors.adminPasswordTooShort')); return; }
    if (admPassword.trim() && admPassword.trim() !== admConfirm.trim()) { setAdmError(t('participantProfile.errors.passwordsMismatch')); return; }

    setAdmSaving(true); setAdmError(''); setAdmSuccess(false);
    try {
      const updates: Parameters<typeof updateUserAccount>[1] = {};
      if (admUsername.trim() !== linkedUser.username) updates.username = admUsername.trim();
      if (admPassword.trim()) updates.password = admPassword.trim();
      if (admRole !== linkedUser.role) updates.role = admRole;
      if (admIsActive !== linkedUser.isActive) updates.isActive = admIsActive;
      const targetCommunityId = currentCommunity?.id ?? null;
      if (admRole !== 'superadmin' && targetCommunityId && linkedUser.communityId !== targetCommunityId) {
        updates.communityId = targetCommunityId;
      }

      if (Object.keys(updates).length > 0) {
        const updated = await updateUserAccount(linkedUser.id, updates);
        setLinkedUser(updated);
        setAdmPassword(''); setAdmConfirm('');
        setAdmSuccess(true);
      } else {
        setAdmError(t('participantProfile.errors.noChanges'));
      }
    } catch (err: any) {
      setAdmError(err.message || t('participantProfile.errors.updateAccountFailed'));
    } finally {
      setAdmSaving(false);
    }
  }

  async function handleDeleteParticipant() {
    if (!participant) return;
    setDeleteSaving(true);
    try {
      await removeParticipant(participant.id);
      if (linkedUser) await deleteUserAccount(linkedUser.id);
      setShowDeleteConfirm(false);
      navigate(getPath('participants'));
    } catch (err: any) {
      setEditError(err.message || t('participantProfile.errors.deleteFailed'));
    } finally {
      setDeleteSaving(false);
    }
  }

  if (notFound) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="empty-state card">
            <h3>{t('participantProfile.notFoundTitle')}</h3>
            <button className="btn-outline mt-2" onClick={() => navigate(getPath('participants'))}>
              {t('participantProfile.backToRoster')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!participant || !stats) {
    return (
      <div className="profile-page">
        <div className="container">
          <Loading message={t('participantProfile.loading')} />
        </div>
      </div>
    );
  }

  const color = avatarColor(participant.name);
  const bannerBg = `radial-gradient(ellipse at 15% 0%, color-mix(in srgb, ${color} 38%, transparent) 0%, transparent 55%),
                    linear-gradient(135deg, var(--primary-void) 0%, var(--primary-night) 45%, var(--primary-void) 100%)`;
  const characterImg = getCharacterImageUrl(participant.gameId, participant.mainCharacterId);

  return (
    <div className="profile-page">

      {/* ── Banner + avatar ── */}
      <div className="profile-banner" style={{ background: bannerBg, '--avatar-color': color } as React.CSSProperties}>
        <div className="profile-banner-inner container">
          <button className="profile-back-btn" onClick={() => navigate(getPath('participants'))}>
            {t('participantProfile.backToRosterShort')}
          </button>
          <div className="profile-banner-body">
            <div className="profile-identity">
              <div
                className="profile-avatar"
                style={{ background: color, '--avatar-color': color } as React.CSSProperties}
              >
                {participant.avatarUrl
                  ? <img src={participant.avatarUrl} alt={participant.name} />
                  : initials(participant.name)}
              </div>
              <div className="profile-names">
                <h1 className="profile-name">{participant.name}</h1>
                {participant.alias && (
                  <span className="profile-alias">{participant.alias}</span>
                )}
                {participant.phoneNumber && (
                  <a
                    className="profile-phone"
                    href={`https://wa.me/${participant.phoneNumber.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={t('participantProfile.chatOnWhatsApp')}
                  >
                    <i className="fab fa-whatsapp" />
                    {participant.phoneNumber}
                  </a>
                )}
                {participant.gameId && participant.mainCharacterId && (
                  <span className="profile-character">
                    <span className="profile-character-game">
                      {getGame(participant.gameId)?.shortName}
                    </span>
                    <span className="profile-character-name">
                      {getCharacter(participant.gameId, participant.mainCharacterId)?.name}
                    </span>
                  </span>
                )}
                <span className="profile-since">
                  {t('participantProfile.memberSince', { date: new Date(participant.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}
                </span>
              </div>
            </div>

            {/* ELO Rank widget — right side of banner */}
            {(() => {
              const hasPts = (rankEntry?.eloPoints ?? participant.eloPoints) != null;
              const pts   = hasPts ? (rankEntry?.eloPoints ?? participant.eloPoints) : null;
              const eloRank = rankEntry?.eloRank ?? participant.eloRank ?? t('participantProfile.unranked');
              const eloRankLabel = !eloRank || eloRank === 'Sin puntos'
                ? t('common.unranked')
                : eloRank === 'Legend'
                  ? t('rankingInfo.rankLegend')
                  : t(`rankingInfo.tierNames.${eloRank}`);
              const pos   = rankEntry?.position;
              const isLegend = pos != null && pos <= 5;
              const col   = getRankColor(eloRank);
              const icon  = getRankIcon(eloRank);
              return (
                <div
                  className={`profile-elo-widget ${isLegend ? 'profile-elo-widget--legend' : ''}`}
                  style={{ '--elo-color': col } as React.CSSProperties}
                  onClick={() => navigate(getPath('ranking'))}
                  title={t('participantProfile.viewFullRanking')}
                >
                  {/* Glow layer */}
                  <div className="pew-glow" />

                  {/* Legend banner (if top 5) */}
                  {isLegend && (
                    <div className="pew-legend-banner">
                      <i className="fas fa-dragon" />
                      <span>{t('participantProfile.legend')}</span>
                      <i className="fas fa-dragon" />
                    </div>
                  )}

                  {/* Top: label */}
                  <div className="pew-label">{t('participantProfile.eloRanking')}</div>

                  {/* Center: icon + rank name */}
                  <div className="pew-center">
                    <span className="pew-icon">
                      <i className={icon} />
                    </span>
                    <span className="pew-rank">{eloRankLabel}</span>
                  </div>

                  {/* Divider */}
                  <div className="pew-divider" />

                  {/* Bottom row: pts left, position right */}
                  <div className="pew-bottom">
                    <div className="pew-pts-block">
                      <span className="pew-pts-value">{pts != null ? pts.toLocaleString() : '—'}</span>
                      <span className="pew-pts-label">{pts != null ? t('participantProfile.points') : t('participantProfile.unranked')}</span>
                    </div>
                    {pos != null && (
                      <div className="pew-pos-block">
                        <span className="pew-pos-value">#{pos}</span>
                        <span className="pew-pos-label">{t('participantProfile.rankingLabel')}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>{/* profile-banner-body */}
        </div>
        {characterImg && (
          <div className="profile-character-render" aria-hidden="true">
            <img
              src={characterImg}
              alt={getCharacter(participant.gameId ?? '', participant.mainCharacterId ?? '')?.name ?? 'main'}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="profile-tabs-bar">
        <div className="container profile-tabs">
          {(['overview', 'results', 'matches', 'edit'] as Tab[])
            .filter((tabItem) => tabItem !== 'edit' || canEdit)
            .map((tabItem) => (
              <button key={tabItem} className={`profile-tab ${tab === tabItem ? 'active' : ''}`}
                onClick={() => setTab(tabItem)}>
                {tabItem === 'overview' ? t('participantProfile.tabs.overview')
                  : tabItem === 'results' ? t('participantProfile.tabs.results')
                  : tabItem === 'matches' ? t('participantProfile.tabs.matches')
                  : t('participantProfile.tabs.edit')}
              </button>
            ))}
        </div>
      </div>

      <div className="container profile-content">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <>
            {/* Big stat cards */}
            <div className="profile-stat-grid">
              <div className="profile-stat-card profile-stat-card--highlight">
                <span className="psc-value">{stats.wins}</span>
                <span className="psc-label"><i className="fas fa-trophy" /> {t('participantProfile.tournamentStats.wins')}</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.tournamentsPlayed}</span>
                <span className="psc-label">{t('participantProfile.tournamentStats.played')}</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.top3}</span>
                <span className="psc-label">{t('participantProfile.tournamentStats.top3')}</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.winRate > 0 ? `${stats.winRate}%` : '—'}</span>
                <span className="psc-label">{t('participantProfile.tournamentStats.winRate')}</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.matchWins}</span>
                <span className="psc-label">{t('participantProfile.tournamentStats.matchWins')}</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.matchLosses}</span>
                <span className="psc-label">{t('participantProfile.tournamentStats.matchLosses')}</span>
              </div>
            </div>

            {/* Tournament Match Record */}
            {(stats.matchWins + stats.matchLosses) > 0 && (
              <div className="card profile-winrate-card">
                <div className="profile-winrate-header">
                  <span><i className="fas fa-trophy" /> {t('participantProfile.tournamentRecord')}</span>
                  <span>{t('common.record', { wins: stats.matchWins, losses: stats.matchLosses })}</span>
                </div>
                <div className="profile-winrate-bar">
                  <div className="profile-winrate-fill" style={{ width: `${stats.winRate}%` }} />
                </div>
              </div>
            )}

            {/* League Stats */}
            {leagueStats && (
              <div className="profile-stat-grid">
                <div className="profile-stat-card profile-stat-card--highlight">
                  <span className="psc-value">{leagueFirstPlaces}</span>
                  <span className="psc-label"><i className="fas fa-trophy" /> {t('participantProfile.leagueStats.wins')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leaguesWithMatches}</span>
                  <span className="psc-label">{t('participantProfile.leagueStats.played')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueTop5}</span>
                  <span className="psc-label">{t('participantProfile.leagueStats.top5')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.winRate > 0 ? `${leagueStats.winRate}%` : '—'}</span>
                  <span className="psc-label">{t('participantProfile.leagueStats.winRate')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.totalWins}</span>
                  <span className="psc-label">{t('participantProfile.leagueStats.matchWins')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.totalLosses}</span>
                  <span className="psc-label">{t('participantProfile.leagueStats.matchLosses')}</span>
                </div>
              </div>
            )}

            {/* League Match Record */}
            {leagueStats && (
              <div className="card profile-winrate-card profile-winrate-card--league">
                <div className="profile-winrate-header">
                  <span><i className="fas fa-trophy" /> {t('participantProfile.leagueRecord')}</span>
                  <span>{t('common.record', { wins: leagueStats.totalWins, losses: leagueStats.totalLosses })}</span>
                </div>
                <div className="profile-winrate-bar">
                  <div className="profile-winrate-fill" style={{ width: `${leagueStats.winRate}%` }} />
                </div>
              </div>
            )}

            {/* Ranked Duels Stats */}
            <div className="card profile-duels-card">
              <div className="profile-duels-header">
                <h3><i className="fas fa-swords" /> {t('participantProfile.rankedDuels.title')}</h3>
                <button
                  className="btn-outline btn-sm"
                  onClick={() => navigate(getPath('events?tab=ranked'))}
                >
                  {t('participantProfile.rankedDuels.challengePlayers')}
                </button>
              </div>
              <div className="profile-stat-grid">
                <div className="profile-stat-card profile-stat-card--duel">
                  <span className="psc-value">
                    {duelStats.maxChallengesPerWeek - duelStats.challengesThisWeek}
                  </span>
                  <span className="psc-label">
                    <i className="fas fa-fire" /> {t('participantProfile.rankedDuels.availableThisWeek')}
                  </span>
                  <span className="psc-sublabel">
                    {t('participantProfile.rankedDuels.used', { used: duelStats.challengesThisWeek, total: duelStats.maxChallengesPerWeek })}
                    {nextResetText && <span className="reset-timer">{t('participantProfile.rankedDuels.resetsIn', { time: nextResetText })}</span>}
                  </span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{duelStats.duelWinRate > 0 ? `${duelStats.duelWinRate}%` : '—'}</span>
                  <span className="psc-label">{t('participantProfile.rankedDuels.winRate')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{duelStats.duelWins}</span>
                  <span className="psc-label">{t('participantProfile.rankedDuels.wins')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{duelStats.duelLosses}</span>
                  <span className="psc-label">{t('participantProfile.rankedDuels.losses')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{duelStats.pendingChallenges}</span>
                  <span className="psc-label">{t('participantProfile.rankedDuels.pendingChallenges')}</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{duelStats.completedThisWeek}</span>
                  <span className="psc-label">{t('participantProfile.rankedDuels.thisWeek')}</span>
                </div>
              </div>

              {/* Duel Match Record */}
              {duelStats.totalDuels > 0 && (
                <div className="card profile-winrate-card profile-winrate-card--duel">
                  <div className="profile-winrate-header">
                    <span><i className="fas fa-swords" /> {t('participantProfile.rankedDuels.matchRecord')}</span>
                    <span>{t('common.record', { wins: duelStats.duelWins, losses: duelStats.duelLosses })}</span>
                  </div>
                  <div className="profile-winrate-bar">
                    <div className="profile-winrate-fill" style={{ width: `${duelStats.duelWinRate}%` }} />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Results tab ── */}
        {tab === 'results' && (
          <div className="card results-tab">
            <div className="results-subtabs">
              <button
                className={`results-subtab ${resultsSubTab === 'tournaments' ? 'active' : ''}`}
                onClick={() => setResultsSubTab('tournaments')}
              >
                <i className="fas fa-trophy" /> {t('participantProfile.results.tournamentsTab', { count: stats.placements.length })}
              </button>
              <button
                className={`results-subtab ${resultsSubTab === 'leagues' ? 'active' : ''}`}
                onClick={() => setResultsSubTab('leagues')}
              >
                <i className="fas fa-trophy" /> {t('participantProfile.results.leaguesTab', { count: leagueStats?.leagues.length ?? 0 })}
              </button>
            </div>

            {resultsSubTab === 'tournaments' && (
              <>
                <h3 className="mb-3">{t('participantProfile.results.tournamentTitle')}</h3>
                {stats.placements.length === 0 ? (
                  <p className="text-secondary">{t('participantProfile.results.noTournamentResults')}</p>
                ) : (
                  <div className="profile-results-list">
                    {stats.placements.map((pl) => (
                      <div key={pl.tournamentId} className="profile-result-row"
                        onClick={() => navigate(getPath(`events/tournaments/${pl.tournamentId}`))}>
                        <span className="prr-medal">{PLACEMENT_MEDAL[pl.position] ?? <i className="fas fa-gamepad" />}</span>
                        <div className="prr-info">
                          <span className="prr-name">{pl.tournamentName}</span>
                          <span className="prr-meta text-secondary text-sm">
                            {t('participantProfile.results.playersCount', { count: pl.totalParticipants })} · {new Date(pl.date).toLocaleDateString()}
                          </span>
                        </div>
                        <span className={`prr-placement ${pl.position === 1 ? 'gold' : pl.position <= 3 ? 'podium' : ''}`}>
                          {ordinal(pl.position)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {resultsSubTab === 'leagues' && (
              <>
                <h3 className="mb-3">{t('participantProfile.results.leagueTitle')}</h3>
                {(leagueStats?.leagues.length ?? 0) === 0 ? (
                  <p className="text-secondary">{t('participantProfile.results.noLeagueResults')}</p>
                ) : (
                  <div className="profile-results-list">
                    {leagueStats!.leagues.map((pl: LeagueResultEntry) => (
                      <div key={pl.leagueId} className="profile-result-row"
                        onClick={() => navigate(getPath(`events/leagues/${pl.leagueId}`))}>
                        <span className={`prr-medal prr-rank rank-${pl.rank}`}>
                          {pl.rank <= 3 ? PLACEMENT_MEDAL[pl.rank] : pl.rank}
                        </span>
                        <div className="prr-info">
                          <span className="prr-name">{pl.leagueName}</span>
                          <span className="prr-meta text-secondary text-sm">
                            {t('participantProfile.results.recordMatches', {
                              wins: pl.wins,
                              losses: pl.losses,
                              matches: pl.matchesPlayed,
                              eloChange: `${pl.eloChange >= 0 ? '+' : ''}${pl.eloChange}`
                            })}
                          </span>
                        </div>
                        <span className={`prr-placement ${pl.rank === 1 ? 'gold' : pl.rank <= 3 ? 'podium' : ''}`}>
                          {ordinal(pl.rank)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Matches tab ── */}
        {tab === 'matches' && (
          <div className="card matches-tab">
            <h3 className="mb-3">{t('participantProfile.matches.title')}</h3>

            <div className="matches-filters">
              <div className="matches-filter-group">
                <label>{t('participantProfile.matches.typeLabel')}</label>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${matchTypeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setMatchTypeFilter('all')}
                  >
                    {t('participantProfile.matches.all')}
                  </button>
                  <button
                    className={`filter-btn ${matchTypeFilter === 'tournament' ? 'active' : ''}`}
                    onClick={() => setMatchTypeFilter('tournament')}
                  >
                    <i className="fas fa-trophy" /> {t('participantProfile.matches.tournament')}
                  </button>
                  <button
                    className={`filter-btn ${matchTypeFilter === 'league' ? 'active' : ''}`}
                    onClick={() => setMatchTypeFilter('league')}
                  >
                    <i className="fas fa-calendar-alt" /> {t('participantProfile.matches.league')}
                  </button>
                  <button
                    className={`filter-btn ${matchTypeFilter === 'duel' ? 'active' : ''}`}
                    onClick={() => setMatchTypeFilter('duel')}
                  >
                    <i className="fas fa-swords" /> {t('participantProfile.matches.duel')}
                  </button>
                </div>
              </div>

              <div className="matches-filter-group">
                <label>{t('participantProfile.matches.resultLabel')}</label>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${matchResultFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setMatchResultFilter('all')}
                  >
                    {t('participantProfile.matches.all')}
                  </button>
                  <button
                    className={`filter-btn ${matchResultFilter === 'wins' ? 'active' : ''}`}
                    onClick={() => setMatchResultFilter('wins')}
                  >
                    <i className="fas fa-trophy" /> {t('participantProfile.matches.wins')}
                  </button>
                  <button
                    className={`filter-btn ${matchResultFilter === 'losses' ? 'active' : ''}`}
                    onClick={() => setMatchResultFilter('losses')}
                  >
                    <i className="fas fa-times" /> {t('participantProfile.matches.losses')}
                  </button>
                </div>
              </div>
            </div>

            {loadingMatches && <Loading message={t('participantProfile.matches.loading')} />}

            {!loadingMatches && (() => {
              const filtered = allMatches.filter(m => {
                const typeMatch = matchTypeFilter === 'all' || m.type === matchTypeFilter;
                const resultMatch = matchResultFilter === 'all' 
                  || (matchResultFilter === 'wins' && m.winnerId === id)
                  || (matchResultFilter === 'losses' && m.winnerId !== id);
                return typeMatch && resultMatch;
              });

              if (filtered.length === 0) {
                return (
                  <p className="text-secondary">{t('participantProfile.matches.noMatches')}</p>
                );
              }

              return (
                <div className="matches-list">
                  {filtered.map(m => {
                    const isPlayer1 = m.player1Id === id;
                    const won = m.winnerId === id;
                    const opponentId = isPlayer1 ? m.player2Id : m.player1Id;
                    const opponentName = isPlayer1 ? m.player2Name : m.player1Name;

                    return (
                      <div key={m.id} className={`match-item ${won ? 'win' : 'loss'}`}>
                        <div className="match-item-header">
                          <span className={`match-item-result ${won ? 'win' : 'loss'}`}>
                            {won ? <><i className="fas fa-trophy" /> {t('participantProfile.matches.win')}</> : <><i className="fas fa-times" /> {t('participantProfile.matches.loss')}</>}
                          </span>
                          <span className="match-item-type">
                            {m.type && (
                              <>
                                <i className={m.type === 'tournament' ? 'fas fa-trophy' : m.type === 'league' ? 'fas fa-calendar-alt' : m.type === 'duel' ? 'fas fa-swords' : m.type === 'matchmaking' ? 'fas fa-random' : 'fas fa-gamepad'} />
                                {' '}{t(`participantProfile.matches.matchTypes.${m.type}`)}
                              </>
                            )}
                          </span>
                          <span className="match-item-date">
                            {new Date(m.date).toLocaleDateString(undefined, { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div className="match-item-body">
                          <div className="match-item-opponent">
                            <span className="match-item-vs">{t('common.vs')}</span>
                            <span
                              className="match-item-opponent-name"
                              onClick={() => navigate(getPath(`participants/${opponentId}`))}
                            >
                              {opponentName || t('tournament.bracket.unknown')}
                            </span>
                          </div>
                          {m.context && (
                            <div className="match-item-context">
                              <i className="fas fa-info-circle" /> {m.context}
                            </div>
                          )}
                          {m.type !== 'tournament' && m.player1EloChange !== undefined && (
                            <div className="match-item-elo">
                              {isPlayer1 ? (
                                <>
                                  <span>{m.player1EloBefore} → {m.player1EloAfter}</span>
                                  <span className={`elo-change ${m.player1EloChange >= 0 ? 'positive' : 'negative'}`}>
                                    {m.player1EloChange >= 0 ? '+' : ''}{m.player1EloChange}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span>{m.player2EloBefore} → {m.player2EloAfter}</span>
                                  <span className={`elo-change ${m.player2EloChange >= 0 ? 'positive' : 'negative'}`}>
                                    {m.player2EloChange >= 0 ? '+' : ''}{m.player2EloChange}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Edit tab ── */}
        {tab === 'edit' && canEdit && (
          <div className="card profile-edit-form">
            <h3>{t('participantProfile.edit.title')}</h3>
            {editError && <div className="error-message">{editError}</div>}
            {editSuccess && <div className="success-message">{t('participantProfile.edit.success')}</div>}
            <div className="profile-edit-grid">
              <div className="form-group">
                <label>{t('participantProfile.edit.nameLabel')}</label>
                <input type="text" value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder={t('participantProfile.edit.namePlaceholder')} />
              </div>
              <div className="form-group">
                <label>{t('participantProfile.edit.aliasLabel')}</label>
                <input type="text" value={editAlias}
                  onChange={(e) => setEditAlias(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder={t('participantProfile.edit.aliasPlaceholder')} />
              </div>
            </div>
            <div className="form-group profile-phone-field">
              <label>{t('participantProfile.edit.phoneLabel')}</label>
              <input type="tel" value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder={t('participantProfile.edit.phonePlaceholder')} />
              <small className="hint">{t('participantProfile.edit.phoneHint')}</small>
            </div>
            <CharacterSelect
              gameId={editGameId}
              characterId={editCharacterId}
              onGameChange={setEditGameId}
              onCharacterChange={setEditCharacterId}
            />
            <div className="form-actions">
              <button className="btn-outline" onClick={() => setTab('overview')}>{t('participantProfile.edit.cancel')}</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t('participantProfile.edit.saving') : t('participantProfile.edit.save')}
              </button>
            </div>

            {isOwnProfile && (
              <>
                <hr className="profile-password-sep" />
                <h3>{t('participantProfile.edit.securityTitle')}</h3>
                <p className="text-secondary mb-2">{t('participantProfile.edit.changePassword')}</p>
                {pwError && <div className="error-message">{pwError}</div>}
                {pwSuccess && <div className="success-message">{t('participantProfile.edit.passwordSuccess')}</div>}
                <div className="profile-edit-grid">
                  <div className="form-group">
                    <label>{t('participantProfile.edit.currentPassword')}</label>
                    <input type="password" value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      placeholder={t('participantProfile.edit.currentPasswordPlaceholder')} autoComplete="current-password" />
                  </div>
                  <div className="form-group">
                    <label>{t('participantProfile.edit.newPassword')}</label>
                    <input type="password" value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      placeholder={t('participantProfile.edit.newPasswordPlaceholder')} autoComplete="new-password" />
                  </div>
                  <div className="form-group">
                    <label>{t('participantProfile.edit.confirmPassword')}</label>
                    <input type="password" value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      placeholder={t('participantProfile.edit.confirmPlaceholder')} autoComplete="new-password" />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn-primary" onClick={handleChangePassword} disabled={pwSaving}>
                    {pwSaving ? t('participantProfile.edit.updating') : t('participantProfile.edit.changePasswordButton')}
                  </button>
                </div>
              </>
            )}

            {canManageAccounts && (
              <>
                <hr className="profile-password-sep" />
                <h3>{t('participantProfile.edit.accountManagementTitle')}</h3>
                <p className="text-secondary mb-2">{linkedUser ? t('participantProfile.edit.accountManagementLinked') : t('participantProfile.edit.accountManagementNone')}</p>
                {loadingUser && <Loading message={t('participantProfile.edit.loadingAccount')} />}
                {admError && <div className="error-message">{admError}</div>}
                {admSuccess && <div className="success-message">{t('participantProfile.edit.accountUpdated')}</div>}
                {linkedUser ? (
                  <>
                    <div className="profile-edit-grid">
                      <div className="form-group">
                        <label>{t('participantProfile.edit.usernameLabel')}</label>
                        <input type="text" value={admUsername}
                          onChange={(e) => setAdmUsername(e.target.value)}
                          placeholder={t('participantProfile.edit.usernamePlaceholder')} autoComplete="off" />
                      </div>
                      <div className="form-group">
                        <label>{t('participantProfile.edit.newPasswordAdminLabel')}</label>
                        <input type="password" value={admPassword}
                          onChange={(e) => setAdmPassword(e.target.value)}
                          placeholder={t('participantProfile.edit.newPasswordPlaceholder')} autoComplete="new-password" />
                      </div>
                      {admPassword && (
                        <div className="form-group">
                          <label>{t('participantProfile.edit.confirmNewPasswordLabel')}</label>
                          <input type="password" value={admConfirm}
                            onChange={(e) => setAdmConfirm(e.target.value)}
                            placeholder={t('participantProfile.edit.confirmPlaceholder')} autoComplete="new-password" />
                        </div>
                      )}
                      {manageableRoles.length > 0 && (
                        <div className="form-group">
                          <label>{t('participantProfile.edit.roleLabel')}</label>
                          <select value={admRole} onChange={e => setAdmRole(e.target.value as AuthUser['role'])}>
                            {manageableRoles.map(r => (
                              <option key={r} value={r}>
                                {t(`participantProfile.edit.roles.${r}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="form-group pp-account-active-toggle">
                        <label>
                          <input
                            type="checkbox"
                            checked={admIsActive}
                            onChange={e => setAdmIsActive(e.target.checked)}
                          />
                          <span>{t('participantProfile.edit.accountActive')}</span>
                        </label>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn-primary" onClick={handleSaveAdminAccount} disabled={admSaving}>
                        {admSaving ? t('participantProfile.edit.saving') : t('participantProfile.edit.save')}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-secondary">{t('participantProfile.edit.noAccount')}</p>
                )}

                <hr className="profile-password-sep" />
                <h3>{t('participantProfile.edit.dangerZoneTitle')}</h3>
                <p className="text-secondary mb-2">{t('participantProfile.edit.dangerZoneDesc')}</p>
                <div className="form-actions">
                  <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)} disabled={deleteSaving}>
                    {t('participantProfile.edit.deleteParticipant')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <ConfirmModal
          isOpen={showDeleteConfirm}
          title={t('participantProfile.edit.deleteConfirmTitle')}
          message={participant ? t('participantProfile.edit.deleteConfirmMessage', { name: participant.name }) : ''}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteParticipant}
          confirmText={t('common.delete')}
        />
      </div>
    </div>
  );
}

export default ParticipantProfile;
