import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { GlobalParticipant, ComputedStats, MatchRecord, LeagueMatch } from '@/models/types';
import type { AuthUser } from '@/models/auth';
import {
  getParticipant,
  computeStats,
  updateParticipant,
  removeParticipant,
  getParticipantLeagueStats,
  getParticipantLeagueMatches,
  getParticipantStats,
  getTournamentResults,
  getHeadToHead,
  type H2HMatchType,
  type H2HTimeFilter,
  type HeadToHeadEntry,
  type ParticipantStatsSummary,
  type TournamentResult,
  getAllParticipantsAsync,
  inviteToCommunity,
  getParticipantAccountSummary,
  type LeagueStatsSummary,
} from '@/services/participants/participantService';
import { loadTournamentsForParticipantAsync } from '@/services/storage/localStorage';
import { getAllTournamentMatchesAsync } from '@/services/tournament/tournamentService';
import { getAllMatches } from '@/services/ranking/rankingService';
import { initials, avatarColor } from './ParticipantsPage';
import { getCharacter, getGame, GAMES } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import { gameBadgeStyle } from '@/utils/gameColor';
import { charsWithColorsFromGames, parseScoreString } from '@/utils/matchData';
import CharacterIcons from '@/components/CharacterIcons/CharacterIcons';
import PlayerDisplay from '@/components/PlayerDisplay/PlayerDisplay';
import { getLeaderboard, getRankColor, getRankIcon, type LeaderboardEntry } from '@/services/ranking/rankingService';
import { getParticipantElo, getParticipantRank, allGameProfiles, getGameProfile } from '@/utils/participantGames';
import { getDuelStats, getDuelSettingsAsync, getNextWeeklyReset, formatTimeUntilReset } from '@/services/duels/duelService';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { communityRoleOf, gameAdminForOf, outranksOf } from '@/utils/membershipRole';
import { changeMyPassword, listUsers, updateUserAccount, deleteUserAccount } from '@/services/auth/authService';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import Loading from '@/components/Loading/Loading';
import PasswordInput from '@/components/PasswordInput/PasswordInput';
import './ParticipantProfile.css';
import ParticipantStatsOverview from './ParticipantStatsOverview';
import ParticipantTournamentResults from './ParticipantTournamentResults';
import ParticipantLeagueResults from './ParticipantLeagueResults';
import ParticipantH2H from './ParticipantH2H';

type Tab = 'overview' | 'results' | 'h2h' | 'matches' | 'edit';
type MatchTypeFilter = 'all' | 'tournament' | 'league' | 'duel';
type MatchResultFilter = 'all' | 'wins' | 'losses';



function ParticipantProfile() {
  const { t } = useTranslation();
  const { id, communityId: urlCommunityId } = useParams<{ id: string; communityId: string }>();
  const navigate = useNavigate();
  const { currentCommunity, allCommunities, getPath, canAdminCurrentCommunity, isCommunityAdminHere, gameAdminForHere, communityRole } = useCommunity();
  const communityId = urlCommunityId || currentCommunity?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const myParticipantIds = new Set([
    user?.participantId,
    ...Object.values(user?.participantByCommunity ?? {}),
  ].filter(Boolean));
  const isOwnProfile = !!(user && id && myParticipantIds.has(id));
  // Admin con gameAdminFor EN esta comunidad
  const isScopedAdmin = communityRole === 'admin' && gameAdminForHere.length > 0;
  // Can manage other people's accounts only if community owner AND in own community
  const canManageAccounts = canAdminCurrentCommunity && isCommunityAdminHere;

  // Role options a manager can assign, restringidos por su propio rol EN ESTA comunidad
  const manageableRoles: string[] = isSuperAdmin
    ? ['user', 'admin', 'community_admin', 'superadmin']
    : isCommunityAdminHere
      ? ['user', 'admin']
      : [];

  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'overview';

  const [participant, setParticipant] = useState<GlobalParticipant | null>(null);
  const [stats, setStats] = useState<ComputedStats | null>(null);
  const [leagueStats, setLeagueStats] = useState<LeagueStatsSummary | null>(null);
  const [statsSummary, setStatsSummary] = useState<ParticipantStatsSummary | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab === 'edit' && (canAdminCurrentCommunity || isOwnProfile) ? 'edit' : 'overview');
  const [resultsSubTab, setResultsSubTab] = useState<'tournaments' | 'leagues'>('tournaments');
  const [tournamentResults, setTournamentResults] = useState<TournamentResult[]>([]);
  const [loadingTournamentResults, setLoadingTournamentResults] = useState(false);
  // Shared game selector across all non-edit tabs (persisted in ?game= so F5 keeps it)
  const [profileGame, setProfileGame] = useState<string>(() => searchParams.get('game') ?? '');
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false);
  const gameDropdownRef = useRef<HTMLDivElement>(null);

  const primaryGameId = useMemo(() => {
    // Don't pick a default until the participant loads (was racing to 'ssbu')
    if (!participant) return '';
    // The declared primary game (set in Edit) always wins — even if it has no stats yet
    const declared = (participant as GlobalParticipant & { primaryGameId?: string; gameId?: string }).primaryGameId
      || participant.gameId
      || '';
    if (declared) return declared;
    const ids = new Set<string>();
    statsSummary?.peakEloByGame.forEach((e) => ids.add(e.gameId));
    statsSummary?.recordByGame?.forEach((r) => ids.add(r.gameId));
    statsSummary?.characterUsage.forEach((c) => ids.add(c.gameId));
    if (ids.size === 0) GAMES.forEach((g) => ids.add(g.id));
    const availableGames = GAMES.filter((g) => ids.has(g.id));
    return statsSummary?.peakEloByGame[0]?.gameId || availableGames[0]?.id || GAMES[0]?.id || '';
  }, [participant, statsSummary]);

  const [h2hData, setH2hData] = useState<HeadToHeadEntry[]>([]);
  const [loadingH2h, setLoadingH2h] = useState(false);
  const [h2hMatchType, setH2hMatchType] = useState<H2HMatchType>('all');
  const [h2hTimeFilter, setH2hTimeFilter] = useState<H2HTimeFilter>('all');
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

  // Edit state
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [editGameIds, setEditGameIds] = useState<string[]>([]);
  const [editGameMainChars, setEditGameMainChars] = useState<Record<string, string | null>>({});
  const [editPrimaryGameId, setEditPrimaryGameId] = useState<string | null>(null);
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
  const [admRole, setAdmRole] = useState<string>('user');
  const [admGames, setAdmGames] = useState<string[]>([]);
  const [admIsActive, setAdmIsActive] = useState(true);
  const [admError, setAdmError] = useState('');
  const [admSuccess, setAdmSuccess] = useState(false);

  // Username/password son GLOBALES: solo el propio usuario o un superadmin
  // pueden tocarlos. Un community_admin NO puede cambiar credenciales de otro.
  const canEditCredentials = isSuperAdmin || linkedUser?.id === user?.id;
  // Jerarquía: nadie edita la cuenta/participant de un usuario de nivel igual o superior EN esta comunidad
  const outranksLinkedUser = outranksOf(user, linkedUser, communityId);
  // Can edit profile fields only if in own community AND has admin rights, or is own profile
  const canEdit = (canAdminCurrentCommunity && outranksLinkedUser) || isOwnProfile;
  const [admSaving, setAdmSaving] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Multi-community invite
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteCommunityId, setInviteCommunityId] = useState('');
  const [accountSummary, setAccountSummary] = useState<{ hasAccount: boolean; communityIds: string[] } | null>(null);

  // Comunidades donde el viewer puede invitar: las que administra como
  // community_admin (o TODAS si es superadmin), menos las donde el target
  // ya es miembro. Independiente de poder editar el participant — un
  // community_admin de otra comunidad puede invitar sin editar nada aquí.
  const adminCommunityIds = isSuperAdmin
    ? allCommunities.map((c) => c.id)
    : (user?.memberships ?? [])
        .filter((m) => m.isActive !== false && m.role === 'community_admin')
        .map((m) => m.communityId);
  const targetCommunityIds = new Set(
    [
      ...(accountSummary?.communityIds ?? []),
      ...(linkedUser?.memberships ?? [])
        .filter((m) => m.isActive !== false)
        .map((m) => m.communityId),
      linkedUser?.communityId,
      participant?.communityId,
    ].filter(Boolean) as string[]
  );
  const invitableCommunities = allCommunities.filter(
    (c) => adminCommunityIds.includes(c.id) && !targetCommunityIds.has(c.id)
  );
  // Solo se puede invitar si el participant tiene cuenta vinculada
  const canInvite = (accountSummary?.hasAccount ?? linkedUser != null) && invitableCommunities.length > 0;

  useEffect(() => {
    if (!id || !communityId) return;
    (async () => {
      try {
        // Refrescar participantes del servidor; no confiar en localStorage tras nuevas membresías
        const all = await getAllParticipantsAsync(communityId);
        const p = all.find((x) => x.id === id) ?? getParticipant(id, communityId);
        if (!p) { setNotFound(true); return; }
        const [tournaments, ls, ps] = await Promise.all([
          loadTournamentsForParticipantAsync(id),
          getParticipantLeagueStats(id),
          getParticipantStats(id),
        ]);
        setParticipant(p);
        setStats(computeStats(p, tournaments));
        setLeagueStats(ls);
        setStatsSummary(ps);
        setEditName(p.name);
        setEditAlias(p.alias ?? '');
        const games = Object.keys(p.games || {});
        setEditGameIds(games.length > 0 ? games : (p.gameId ? [p.gameId] : []));
        const mains: Record<string, string | null> = {};
        for (const [g, prof] of Object.entries(p.games || {})) {
          mains[g] = prof.mainCharacterId ?? null;
        }
        setEditGameMainChars(mains);
        setEditPrimaryGameId(p.gameId ?? (games[0] ?? null));
        setEditPhone(p.phoneNumber ?? '');
      } catch {
        const p = getParticipant(id, communityId);
        if (!p) { setNotFound(true); return; }
        setParticipant(p);
        setStats(computeStats(p));
        setLeagueStats({ leagues: [], totalMatches: 0, totalWins: 0, totalLosses: 0, winRate: 0 });
      }

      // Load duel stats

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

  // Load ELO ranking entry for the currently selected game
  useEffect(() => {
    if (!id || !communityId) return;
    const gameId = profileGame || participant?.gameId || 'ssbu';
    getLeaderboard(communityId, gameId).then((board) => {
      setRankEntry(board.find((e) => e.id === id) ?? null);
    }).catch(() => setRankEntry(null));
  }, [id, communityId, profileGame, participant?.gameId]);

  // Load matches when Matches tab is opened
  useEffect(() => {
    if (tab === 'matches' && id && communityId && allMatches.length === 0) {
      loadMatches();
    }
  }, [tab, id, communityId]);

  // Load tournament results when Results tab is opened
  useEffect(() => {
    if (tab === 'results' && id && tournamentResults.length === 0 && !loadingTournamentResults) {
      setLoadingTournamentResults(true);
      getTournamentResults(id).then((data) => {
        setTournamentResults(data);
        setLoadingTournamentResults(false);
      });
    }
  }, [tab, id]);

  // Load head-to-head data when H2H tab is opened or filter changes
  useEffect(() => {
    if (tab === 'h2h' && id && !loadingH2h) {
      setLoadingH2h(true);
      getHeadToHead(id, h2hMatchType, profileGame, h2hTimeFilter).then((data) => {
        setH2hData(data);
        setLoadingH2h(false);
      });
    }
  }, [tab, id, h2hMatchType, profileGame, h2hTimeFilter]);

  // Load linked user account (admin only)
  useEffect(() => {
    if (!id || !isAdmin) return;
    loadLinkedUser();
  }, [id, isAdmin]);

  // Summary de cuenta para la invitación cross-community — se carga siempre
  // que el viewer administre alguna comunidad, aunque NO pueda ver el user
  // completo (fuera de su scope) ni editar este participant.
  useEffect(() => {
    if (!id || adminCommunityIds.length === 0) { setAccountSummary(null); return; }
    getParticipantAccountSummary(id).then(setAccountSummary).catch(() => setAccountSummary(null));
  }, [id, isSuperAdmin, user?.memberships]);

  // Default game filter to primary game once data loads
  useEffect(() => {
    if (primaryGameId && !profileGame) setProfileGame(primaryGameId);
  }, [primaryGameId, profileGame]);

  // Close game dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (gameDropdownRef.current && !gameDropdownRef.current.contains(e.target as Node)) {
        setGameDropdownOpen(false);
      }
    }
    if (gameDropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [gameDropdownOpen]);

  async function loadLinkedUser() {
    if (!id) return;
    setLoadingUser(true);
    try {
      const all = await listUsers();
      const u = all.find(
        x => x.participantId === id ||
        (x.memberships ?? []).some(m => m.participantId === id)
      ) ?? null;
      setLinkedUser(u);
      if (u) {
        setAdmUsername(u.username);
        setAdmPassword('');
        setAdmConfirm('');
        // Rol/scope se leen de la membership de ESTA comunidad, no de campos globales.
        setAdmRole(communityRoleOf(u, communityId) ?? 'user');
        setAdmGames(gameAdminForOf(u, communityId));
        setAdmIsActive(u.isActive);
      } else {
        setAdmUsername('');
        setAdmPassword('');
        setAdmConfirm('');
        setAdmRole('user');
        setAdmGames([]);
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
      const [tournamentMatches, rankedMatches, leagueMatches, allParticipants] = await Promise.all([
        getAllTournamentMatchesAsync(communityId),
        getAllMatches(communityId),
        getParticipantLeagueMatches(id),
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
              gameId: m.gameId,
              player1Id: gP1?.id ?? m.player1GlobalId ?? m.player1Id,
              player2Id: gP2?.id ?? m.player2GlobalId ?? m.player2Id,
              winnerId: player1IsWinner
                ? (gP1?.id ?? m.winnerGlobalId ?? m.winnerId)
                : (gP2?.id ?? m.winnerGlobalId ?? m.winnerId),
              player1Name: gP1?.name ?? (m.player1Name || t('tournament.bracket.unknown')),
              player2Name: gP2?.name ?? (m.player2Name || t('tournament.bracket.unknown')),
              player1Alias: gP1?.alias ?? null,
              player2Alias: gP2?.alias ?? null,
              date: m.createdAt,
              context: m.tournamentName,
              player1Score: m.player1Score ?? null,
              player2Score: m.player2Score ?? null,
              player1Chars: m.player1Characters?.length ? m.player1Characters : charsWithColorsFromGames(m.games, 1),
              player2Chars: m.player2Characters?.length ? m.player2Characters : charsWithColorsFromGames(m.games, 2),
            };
          }),
        ...rankedMatches
          .filter((m: MatchRecord) => m.playerAId === id || m.playerBId === id)
          .map((m: MatchRecord) => ({
            id: m.id,
            type: (m.type as 'duel' | 'matchmaking' | 'free') ?? 'duel',
            gameId: m.gameId,
            player1Id: m.playerAId,
            player2Id: m.playerBId,
            winnerId: m.winnerId,
            player1Name: participantMap.get(m.playerAId)?.name ?? t('tournament.bracket.unknown'),
            player2Name: participantMap.get(m.playerBId)?.name ?? t('tournament.bracket.unknown'),
            player1Alias: participantMap.get(m.playerAId)?.alias ?? null,
            player2Alias: participantMap.get(m.playerBId)?.alias ?? null,
            player1EloBefore: m.playerAPointsBefore,
            player2EloBefore: m.playerBPointsBefore,
            player1EloAfter: m.playerAPointsAfter,
            player2EloAfter: m.playerBPointsAfter,
            player1EloChange: m.playerADelta,
            player2EloChange: m.playerBDelta,
            date: m.createdAt,
            player1Score: m.player1Score ?? null,
            player2Score: m.player2Score ?? null,
            player1Chars: m.player1Characters?.length ? m.player1Characters : charsWithColorsFromGames(m.games, 1),
            player2Chars: m.player2Characters?.length ? m.player2Characters : charsWithColorsFromGames(m.games, 2),
          })),
        ...leagueMatches
          .filter((m: LeagueMatch) =>
            (m.participant1Id === id || m.participant2Id === id) &&
            (m.status === 'completed' || m.status === 'no_show')
          )
          .map((m: LeagueMatch) => {
            const p1 = participantMap.get(m.participant1Id);
            const p2 = participantMap.get(m.participant2Id);
            const [s1, s2] = parseScoreString(m.score);
            return {
              id: m.id,
              type: 'league' as const,
              gameId: m.gameId,
              player1Id: m.participant1Id,
              player2Id: m.participant2Id,
              winnerId: m.winnerId,
              player1Name: p1?.name ?? t('tournament.bracket.unknown'),
              player2Name: p2?.name ?? t('tournament.bracket.unknown'),
              player1Alias: p1?.alias ?? null,
              player2Alias: p2?.alias ?? null,
              date: m.completedDate ?? m.scheduledDate ?? '',
              context: `League ${m.week ? `Week ${m.week}` : ''}`,
              player1Score: s1,
              player2Score: s2,
              player1Chars: charsWithColorsFromGames(m.games, 1),
              player2Chars: charsWithColorsFromGames(m.games, 2),
            };
          }),
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
        gameIds: editGameIds,
        // Un admin scopenado no puede cambiar el default game del participante
        ...(!isScopedAdmin ? { primaryGameId: editPrimaryGameId } : {}),
        gameMainCharacters: editGameMainChars,
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
      // Credenciales globales: solo si el editor es el propio usuario o superadmin.
      if (canEditCredentials) {
        if (admUsername.trim() !== linkedUser.username) updates.username = admUsername.trim();
        if (admPassword.trim()) updates.password = admPassword.trim();
      }
      if (admIsActive !== linkedUser.isActive) updates.isActive = admIsActive;

      // Rol/gameAdminFor viven en la membership de ESTA comunidad (salvo 'superadmin',
      // que es un flag global). El backend necesita `communityId` para saber qué
      // membership actualizar.
      const currentRoleHere = communityRoleOf(linkedUser, communityId) ?? 'user';
      const currentGamesHere = gameAdminForOf(linkedUser, communityId);
      const roleChanged = admRole !== currentRoleHere;
      const gamesChanged = admRole === 'admin' &&
        JSON.stringify([...admGames].sort()) !== JSON.stringify([...currentGamesHere].sort());

      if (roleChanged) updates.role = admRole as AuthUser['role'];
      if (roleChanged || gamesChanged) {
        if (admRole === 'admin') updates.gameAdminFor = admGames;
        else if (admRole !== 'superadmin') updates.gameAdminFor = [];
      }
      if ((roleChanged || gamesChanged) && admRole !== 'superadmin' && communityId) {
        updates.communityId = communityId;
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

  async function handleInviteToCommunity() {
    const targetId = inviteCommunityId || invitableCommunities[0]?.id;
    if (!participant || !targetId) return;
    setInviteSaving(true); setInviteError(''); setInviteMsg('');
    try {
      await inviteToCommunity(participant.id, targetId);
      setInviteMsg(t('participantProfile.edit.inviteSent', { defaultValue: 'Invitación enviada' }));
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invite');
    } finally {
      setInviteSaving(false);
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

  function toggleGame(gameId: string, checked: boolean) {
    setEditGameIds((prev) => {
      const next = checked ? [...prev, gameId] : prev.filter((g) => g !== gameId);
      if (!next.includes(editPrimaryGameId ?? '')) {
        setEditPrimaryGameId(next[0] ?? null);
      }
      if (!checked) {
        setEditGameMainChars((mains) => {
          const nextMains = { ...mains };
          delete nextMains[gameId];
          return nextMains;
        });
      }
      return next;
    });
  }

  function setGameMain(gameId: string, characterId: string | null) {
    setEditGameMainChars((prev) => ({ ...prev, [gameId]: characterId }));
  }

  const color = avatarColor(participant.name);
  const bannerBg = `radial-gradient(ellipse at 15% 0%, color-mix(in srgb, ${color} 38%, transparent) 0%, transparent 55%),
                    linear-gradient(135deg, var(--primary-void) 0%, var(--primary-night) 45%, var(--primary-void) 100%)`;
  const bannerGameId = profileGame || participant.gameId || 'ssbu';
  const bannerCharId = getGameProfile(participant, bannerGameId)?.mainCharacterId ?? null;
  const characterImg = getCharacterImageUrl(bannerGameId, bannerCharId);

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
                <h1 className="profile-name">{participant.alias || participant.name}</h1>
                {participant.alias && (
                  <span className="profile-alias">{participant.name}</span>
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
                {/* {participant.gameId && participant.mainCharacterId && (
                  <span className="profile-character">
                    <span className="profile-character-game" style={{ color: getGame(participant.gameId)?.color }}>
                      {getGame(participant.gameId)?.shortName}
                    </span>
                    <span className="profile-character-name">
                      {getCharacter(participant.gameId, participant.mainCharacterId)?.name}
                    </span>
                  </span>
                )} */}
                <span className="profile-since">
                  {t('participantProfile.memberSince', { date: new Date(participant.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}
                </span>
              </div>
            </div>

            {/* ELO Rank widget — right side of banner */}
            {(() => {
              const gameId = profileGame || participant.gameId || 'ssbu';
              const participantElo = getParticipantElo(participant, gameId);
              const participantRank = getParticipantRank(participant, gameId);
              const hasPts = (rankEntry?.eloPoints ?? participantElo) != null;
              const pts   = hasPts ? (rankEntry?.eloPoints ?? participantElo) : null;
              const eloRank = rankEntry?.eloRank ?? participantRank ?? t('participantProfile.unranked');
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
              alt={getCharacter(bannerGameId, bannerCharId ?? '')?.name ?? 'main'}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="profile-tabs-bar">
        <div className="container profile-tabs">
          {(['overview', 'results', 'h2h', 'matches', 'edit'] as Tab[])
            .filter((tabItem) => tabItem !== 'edit' || canEdit)
            .map((tabItem) => (
              <button key={tabItem} className={`profile-tab ${tab === tabItem ? 'active' : ''}`}
                onClick={() => setTab(tabItem)}>
                {tabItem === 'overview' ? t('participantProfile.tabs.overview')
                  : tabItem === 'results' ? t('participantProfile.tabs.results')
                  : tabItem === 'h2h' ? t('participantProfile.tabs.h2h', 'H2H')
                  : tabItem === 'matches' ? t('participantProfile.tabs.matches')
                  : t('participantProfile.tabs.edit')}
              </button>
            ))}
        </div>
      </div>

      {/* ── Per-tab game selector (same as Overview, only when relevant) ── */}
      {tab !== 'edit' && (() => {
        if (!statsSummary) return null;
        const ids = new Set<string>();
        statsSummary.peakEloByGame.forEach((e) => ids.add(e.gameId));
        statsSummary.recordByGame?.forEach((r) => ids.add(r.gameId));
        statsSummary.characterUsage.forEach((c) => ids.add(c.gameId));
        if (ids.size === 0) GAMES.forEach((g) => ids.add(g.id));
        const availableGames = GAMES.filter((g) => ids.has(g.id));
        if (availableGames.length <= 1) return null;

        const selectedGame = availableGames.find((g) => g.id === profileGame) || availableGames[0];
        if (!selectedGame) return null;
        const accent = selectedGame.color;

        return (
          <div ref={gameDropdownRef} className="container profile-game-bar">
            <div
              className="profile-game-pill active"
              style={{ '--game-accent': accent } as React.CSSProperties}
              onClick={() => setGameDropdownOpen((v) => !v)}
            >
              <span className="game-badge" style={{ background: '#fff', color: accent }}>
                {selectedGame.id.toUpperCase()}
              </span>
              <span className="profile-game-pill-name">{selectedGame.name}</span>
              <i className={`fas fa-chevron-down profile-game-chevron ${gameDropdownOpen ? 'up' : ''}`} />
            </div>

            {gameDropdownOpen && (
              <div className="profile-game-menu">
                {availableGames.map((g) => {
                  const isActive = profileGame === g.id;
                  return (
                    <button
                      key={g.id}
                      className={`profile-game-option ${isActive ? 'active' : ''}`}
                      style={g.color ? { '--game-accent': g.color } as React.CSSProperties : {}}
                      onClick={() => {
                        setProfileGame(g.id);
                        setGameDropdownOpen(false);
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.set('game', g.id);
                          return next;
                        }, { replace: true });
                      }}
                    >
                      <span className="game-badge" style={isActive
                        ? { background: '#fff', color: g.color, border: 'none' }
                        : { background: g.color, color: '#fff', border: 'none' }}>
                        {g.id.toUpperCase()}
                      </span>
                      <span>{g.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      <div className="container profile-content">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <>
            {/* Invite to another community — visible to community_admin of the
                target community (o superadmin), sin necesidad de permisos de
                edición sobre este participant. */}
            {canInvite && (
              <div className="card profile-invite-card">
                <h3><i className="fas fa-user-plus" /> {t('participantProfile.edit.inviteSectionTitle', { defaultValue: 'Invitar a tu comunidad' })}</h3>
                <p className="text-secondary">
                  {t('participantProfile.edit.inviteSectionDesc', { defaultValue: 'El participante recibirá una invitación para unirse a la comunidad seleccionada.' })}
                </p>
                <div className="profile-invite-row">
                  {invitableCommunities.length > 1 && (
                    <select
                      className="form-control"
                      value={inviteCommunityId || invitableCommunities[0]?.id}
                      onChange={(e) => { setInviteCommunityId(e.target.value); setInviteMsg(''); setInviteError(''); }}
                    >
                      {invitableCommunities.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                  <button className="btn-outline" onClick={handleInviteToCommunity} disabled={inviteSaving || !!inviteMsg}>
                    <i className="fas fa-paper-plane" /> {inviteSaving ? t('participantProfile.edit.saving') : t('participantProfile.edit.inviteToCommunity', { defaultValue: 'Invitar' })}
                  </button>
                </div>
                {inviteMsg && <div className="success-message">{inviteMsg}</div>}
                {inviteError && <div className="error-message">{inviteError}</div>}
              </div>
            )}

            <ParticipantStatsOverview stats={statsSummary} participant={participant} gameFilter={profileGame} />

            {/* Per-game ELO profiles */}
            {participant && (
              <div className="card profile-games-card">
                <h3><i className="fas fa-gamepad" /> {t('participantProfile.gameProfiles')}</h3>
                <div className="profile-games-list">
                  {allGameProfiles(participant).length > 0 ? (
                    allGameProfiles(participant).map((profile) => {
                      const game = getGame(profile.gameId);
                      const pts = profile.eloPoints;
                      const rank = profile.eloRank;
                      return (
                        <div key={profile.gameId} className="profile-game-item">
                          <span className="profile-game-name" style={{ color: game?.color }}>{game?.name ?? profile.gameId}</span>
                          <span className="profile-game-rank" style={{ color: getRankColor(rank) }}>
                            <i className={getRankIcon(rank)} /> {rank === 'Sin puntos' ? t('common.unranked') : rank}
                          </span>
                          <span className="profile-game-pts">{pts != null ? pts.toLocaleString() : '—'}</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-secondary">{t('participantProfile.noGameProfiles')}</p>
                  )}
                </div>
              </div>
            )}

            {/* Ranked Duels — challenge info only (stats are in overview dashboard) */}
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
              <div className="profile-duels-summary">
                <div className="profile-duel-stat">
                  <span className="profile-duel-value">{duelStats.maxChallengesPerWeek - duelStats.challengesThisWeek}</span>
                  <span className="profile-duel-label">{t('participantProfile.rankedDuels.availableThisWeek')}</span>
                  {nextResetText && <span className="profile-duel-reset">{t('participantProfile.rankedDuels.resetsIn', { time: nextResetText })}</span>}
                </div>
                <div className="profile-duel-stat">
                  <span className="profile-duel-value">{duelStats.pendingChallenges}</span>
                  <span className="profile-duel-label">{t('participantProfile.rankedDuels.pendingChallenges')}</span>
                </div>
                <div className="profile-duel-stat">
                  <span className="profile-duel-value">{duelStats.completedThisWeek}</span>
                  <span className="profile-duel-label">{t('participantProfile.rankedDuels.thisWeek')}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Results tab ── */}
        {tab === 'results' && (
          <div className="results-tab">
            {/* Sub-tabs */}
            <div className="card results-subtab-bar">
              <button
                className={`results-subtab ${resultsSubTab === 'tournaments' ? 'active' : ''}`}
                onClick={() => setResultsSubTab('tournaments')}
              >
                <i className="fas fa-trophy" /> {t('participantProfile.results.tournamentsTab', { count: tournamentResults.length })}
              </button>
              <button
                className={`results-subtab ${resultsSubTab === 'leagues' ? 'active' : ''}`}
                onClick={() => setResultsSubTab('leagues')}
              >
                <i className="fas fa-shield-alt" /> {t('participantProfile.results.leaguesTab', { count: completedLeagues.length })}
              </button>
            </div>

            {resultsSubTab === 'tournaments' && (
              <div className="card results-panel">
                {loadingTournamentResults ? (
                  <div className="tr-empty">
                    <i className="fas fa-spinner fa-spin" /> {t('common.loading', 'Loading...')}
                  </div>
                ) : (
                  <ParticipantTournamentResults
                    results={profileGame ? tournamentResults.filter((r) => r.gameId === profileGame) : tournamentResults}
                    onNavigate={(tId) => navigate(getPath(`events/tournaments/${tId}`))}
                  />
                )}
              </div>
            )}

            {resultsSubTab === 'leagues' && (
              <div className="card results-panel">
                <ParticipantLeagueResults
                  results={profileGame ? completedLeagues.filter((l) => !l.gameId || l.gameId === profileGame) : completedLeagues}
                  onNavigate={(id) => navigate(getPath(`events/leagues/${id}`))}
                />
              </div>
            )}
          </div>
        )}

        {/* ── H2H tab ── */}
        {tab === 'h2h' && (
          <ParticipantH2H
            entries={h2hData}
            matchType={h2hMatchType}
            onMatchTypeChange={setH2hMatchType}
            timeFilter={h2hTimeFilter}
            onTimeFilterChange={setH2hTimeFilter}
            loading={loadingH2h}
            onNavigateParticipant={(pid) => navigate(getPath(`participants/${pid}`))}
          />
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

              {/* game filter handled by global selector above tabs */}
            </div>

            {loadingMatches && <Loading message={t('participantProfile.matches.loading')} />}

            {!loadingMatches && (() => {
              const filtered = allMatches.filter(m => {
                const typeMatch = matchTypeFilter === 'all' || m.type === matchTypeFilter;
                const resultMatch = matchResultFilter === 'all' 
                  || (matchResultFilter === 'wins' && m.winnerId === id)
                  || (matchResultFilter === 'losses' && m.winnerId !== id);
                const gameMatch = !profileGame || m.gameId === profileGame;
                return typeMatch && resultMatch && gameMatch;
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
                    const opponentAlias = isPlayer1 ? m.player2Alias : m.player1Alias;
                    const myScore = isPlayer1 ? m.player1Score : m.player2Score;
                    const oppScore = isPlayer1 ? m.player2Score : m.player1Score;
                    const myChars = isPlayer1 ? m.player1Chars : m.player2Chars;
                    const oppChars = isPlayer1 ? m.player2Chars : m.player1Chars;
                    const hasScore = myScore !== null && myScore !== undefined && oppScore !== null && oppScore !== undefined;

                    return (
                      <div key={m.id} className={`match-item ${won ? 'win' : 'loss'}`}>
                        <div className="match-item-header">
                          {m.gameId && (
                            <span className="match-item-game" style={gameBadgeStyle(m.gameId)}>
                              {m.gameId.toUpperCase()}
                            </span>
                          )}
                          <span className="match-item-date">
                            {new Date(m.date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <span className="match-item-header-break" aria-hidden="true" />
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
                        </div>
                        <div className="match-item-body">
                          <div className="match-item-opponent">
                            <CharacterIcons gameId={m.gameId} characterIds={myChars} />
                            <span className="match-item-vs">{t('common.vs')}</span>
                            <span
                              className="match-item-opponent-name"
                              onClick={() => navigate(getPath(`participants/${opponentId}`))}
                            >
                              <PlayerDisplay name={opponentName || t('tournament.bracket.unknown')} alias={opponentAlias} size="sm" />
                            </span>
                            <CharacterIcons gameId={m.gameId} characterIds={oppChars} />
                            {hasScore && (
                              <span className="match-item-score">
                                <span className={won ? 'ms-win' : 'ms-loss'}>{myScore}</span>
                                <em>–</em>
                                <span className={!won ? 'ms-win' : 'ms-loss'}>{oppScore}</span>
                              </span>
                            )}
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
            <div className="profile-game-list">
              <h4>{t('participantProfile.edit.games')}</h4>
              {GAMES.map((g) => {
                const outOfScope = isScopedAdmin && !gameAdminForHere.includes(g.id);
                return (
                <div key={g.id} className="profile-game-row" style={outOfScope ? { opacity: 0.45 } : undefined}
                  title={outOfScope ? t('participantProfile.edit.gameAdminNotYourGame', { defaultValue: 'You are not admin of this game' }) : undefined}>
                  <label className="profile-game-checkbox">
                    <input
                      type="checkbox"
                      checked={editGameIds.includes(g.id)}
                      disabled={outOfScope}
                      onChange={(e) => toggleGame(g.id, e.target.checked)}
                    />
                    <span style={{ color: g.color }}>{g.shortName}</span>
                  </label>
                  {editGameIds.includes(g.id) && (
                    <select
                      className="form-control"
                      value={editGameMainChars[g.id] ?? ''}
                      disabled={outOfScope}
                      onChange={(e) => setGameMain(g.id, e.target.value || null)}
                    >
                      <option value="">{t('common.noMain')}</option>
                      {g.characters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                );
              })}
            </div>

            {editGameIds.length > 0 && (
              <div className="form-group">
                <label>{t('participantProfile.edit.primaryGame')}</label>
                {isScopedAdmin ? (
                  <div className="form-control" style={{ opacity: 0.6 }}>
                    {getGame(editPrimaryGameId ?? '')?.shortName ?? editPrimaryGameId ?? t('common.none', { defaultValue: 'None' })}
                  </div>
                ) : (
                  <select
                    className="form-control"
                    value={editPrimaryGameId ?? ''}
                    onChange={(e) => setEditPrimaryGameId(e.target.value || null)}
                  >
                    {editGameIds.map((gId) => (
                      <option key={gId} value={gId}>{getGame(gId)?.shortName ?? gId}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
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
                    <PasswordInput value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      placeholder={t('participantProfile.edit.currentPasswordPlaceholder')} autoComplete="current-password" />
                  </div>
                  <div className="form-group">
                    <label>{t('participantProfile.edit.newPassword')}</label>
                    <PasswordInput value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      placeholder={t('participantProfile.edit.newPasswordPlaceholder')} autoComplete="new-password" />
                  </div>
                  <div className="form-group">
                    <label>{t('participantProfile.edit.confirmPassword')}</label>
                    <PasswordInput value={pwConfirm}
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
                      {canEditCredentials && (
                        <>
                          <div className="form-group">
                            <label>{t('participantProfile.edit.usernameLabel')}</label>
                            <input type="text" value={admUsername}
                              onChange={(e) => setAdmUsername(e.target.value)}
                              placeholder={t('participantProfile.edit.usernamePlaceholder')} autoComplete="off" />
                          </div>
                          <div className="form-group">
                            <label>{t('participantProfile.edit.newPasswordAdminLabel')}</label>
                            <PasswordInput value={admPassword}
                              onChange={(e) => setAdmPassword(e.target.value)}
                              placeholder={t('participantProfile.edit.newPasswordPlaceholder')} autoComplete="new-password" />
                          </div>
                          {admPassword && (
                            <div className="form-group">
                              <label>{t('participantProfile.edit.confirmNewPasswordLabel')}</label>
                              <PasswordInput value={admConfirm}
                                onChange={(e) => setAdmConfirm(e.target.value)}
                                placeholder={t('participantProfile.edit.confirmPlaceholder')} autoComplete="new-password" />
                            </div>
                          )}
                        </>
                      )}
                      {manageableRoles.length > 0 && (
                        <div className="form-group">
                          <label>{t('participantProfile.edit.roleLabel')}</label>
                          <select value={admRole} onChange={e => setAdmRole(e.target.value)}>
                            {manageableRoles.map(r => (
                              <option key={r} value={r}>
                                {t(`participantProfile.edit.roles.${r}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {admRole === 'admin' && (
                        <div className="form-group game-admin-scope">
                          <label>{t('participantProfile.edit.gameAdminScopeLabel', { defaultValue: 'Juegos que puede administrar (vacío = todos)' })}</label>
                          <div className="game-admin-games">
                            {GAMES.map(g => {
                              const active = admGames.includes(g.id);
                              return (
                                <label
                                  key={g.id}
                                  className={`game-admin-row ${active ? 'active' : ''}`}
                                  style={active ? { borderColor: g.color, background: `${g.color}0d` } : undefined}
                                >
                                  <input
                                    type="checkbox"
                                    checked={active}
                                    onChange={(e) => setAdmGames(prev =>
                                      e.target.checked ? [...prev, g.id] : prev.filter(x => x !== g.id)
                                    )}
                                  />
                                  <span className="game-admin-row-name" style={{ color: active ? g.color : undefined }}>{g.name}</span>
                                  <span className="game-admin-row-id">{g.id.toUpperCase()}</span>
                                </label>
                              );
                            })}
                          </div>
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
