import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCommunity } from '@/contexts/CommunityContext';
import { getAllLeagues } from '@/services/leagues/leagueService';
import { getAllParticipants, getAllParticipantsAsync } from '@/services/participants/participantService';
import {
  HISTORY_TYPES,
  buildHistorySpec,
  createHistorySource,
  getHistoryCounts,
  type HistoryCounts,
  type HistoryRow,
  type HistoryType,
} from '@/services/history/historyService';
import { GlobalParticipant } from '@/models/types';
import { gameBadgeStyle } from '@/utils/gameColor';
import { charsWithColorsFromGames, parseScoreString, type ColoredChar } from '@/utils/matchData';
import CharacterIcons from '@/components/CharacterIcons/CharacterIcons';
import PlayerDisplay from '@/components/PlayerDisplay/PlayerDisplay';
import PlayerDropdown from '@/components/PlayerDropdown/PlayerDropdown';
import Loading from '@/components/Loading/Loading';
import OfflineNotice from '@/components/OfflineNotice/OfflineNotice';
import Pagination from '@/components/Pagination/Pagination';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { useOnReconnect } from '@/hooks/useServerStatus';
import './HistoryTab.css';

type HistoryFilter = 'all' | 'tournament' | 'league' | 'duel' | 'matchmaking';

interface UnifiedMatch {
  id: string;
  type: HistoryType;
  gameId?: string | null;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  player1Name: string;
  player2Name: string;
  player1Alias?: string | null;
  player2Alias?: string | null;
  player1EloBefore: number;
  player2EloBefore: number;
  player1EloAfter: number;
  player2EloAfter: number;
  player1EloChange: number;
  player2EloChange: number;
  date: string;
  context?: string; // Tournament/League name
  player1Score: number | null;
  player2Score: number | null;
  player1Chars: (string | ColoredChar)[];
  player2Chars: (string | ColoredChar)[];
}

function HistoryTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCommunity, getPath, communityGames, isFeatureEnabled } = useCommunity();
  const communityId = currentCommunity?.id;

  // Tipos deshabilitados por la comunidad — se filtran de la lista entera
  const typeDisabled = (type: string): boolean => {
    if (type === 'tournament') return !isFeatureEnabled('tournaments');
    if (type === 'league') return !isFeatureEnabled('leagues');
    if (type === 'duel') return !isFeatureEnabled('duels');
    if (type === 'matchmaking') return !isFeatureEnabled('matchmaking');
    // 'free' = partidas rankeadas libres — solo si algún módulo ranked vive
    return !isFeatureEnabled('duels') && !isFeatureEnabled('matchmaking');
  };
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [filterGameId, setFilterGameId] = useState<string | null>(null);
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);
  const [leagueNameById, setLeagueNameById] = useState<Map<string, string>>(new Map());
  const [counts, setCounts] = useState<HistoryCounts | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  // Names for rows (participants, league titles) — small lists, cached by their own services.
  const loadLookups = () => {
    if (!communityId) return;
    getAllParticipantsAsync(communityId)
      .then((data) => (data.length > 0 ? data : getAllParticipants(communityId)))
      .then(setAllParticipants);
    getAllLeagues(communityId).then((ls) => setLeagueNameById(new Map(ls.map((l) => [l.id, l.name]))));
    getHistoryCounts(communityId).then(setCounts);
  };
  useEffect(loadLookups, [communityId]);
  useOnReconnect(loadLookups);

  // Paginated: type / game / player filters run in the server online and on the local copy offline.
  const source = useMemo(() => (communityId ? createHistorySource(communityId, 'events-history') : null), [communityId]);
  const enabledGameKey = communityGames.map((g) => g.id).join(',');
  const disabledKey = HISTORY_TYPES.filter(typeDisabled).join(',');
  const spec = useMemo(
    () => buildHistorySpec({
      type: filter,
      gameId: filterGameId,
      enabledGameIds: enabledGameKey ? enabledGameKey.split(',') : [],
      disabledTypes: (disabledKey ? disabledKey.split(',') : []) as HistoryType[],
      playerId: selectedPlayerId,
    }),
    [filter, filterGameId, enabledGameKey, disabledKey, selectedPlayerId]
  );
  const list = usePaginatedList<HistoryRow>({ source, spec });

  const getParticipantName = (id: string, participants: GlobalParticipant[]): string => {
    const p = participants.find(p => p.id === id);
    return p ? p.name : t('history.unknownPlayer');
  };

  // Row → card model. Elo / context / characters come from the original record.
  const toUnified = (row: HistoryRow): UnifiedMatch => {
    const m = row.data;
    const aliasOf = (id: string | null | undefined) => allParticipants.find((p) => p.id === id)?.alias ?? null;
    if (row.kind === 'tournament') {
      const gP1 = m.player1GlobalId ? allParticipants.find((p) => p.id === m.player1GlobalId) : null;
      const gP2 = m.player2GlobalId ? allParticipants.find((p) => p.id === m.player2GlobalId) : null;
      const player1Id = gP1?.id ?? m.player1GlobalId ?? m.player1Id;
      const player2Id = gP2?.id ?? m.player2GlobalId ?? m.player2Id;
      return {
        id: row.id,
        type: 'tournament',
        gameId: row.gameId,
        player1Id,
        player2Id,
        winnerId: m.winnerGlobalId ?? (m.winnerId === m.player1Id ? player1Id : m.winnerId === m.player2Id ? player2Id : m.winnerId),
        player1Name: gP1?.name ?? (m.player1Name || t('tournament.bracket.unknown')),
        player2Name: gP2?.name ?? (m.player2Name || t('tournament.bracket.unknown')),
        player1Alias: gP1?.alias ?? null,
        player2Alias: gP2?.alias ?? null,
        player1EloBefore: 0,
        player2EloBefore: 0,
        player1EloAfter: 0,
        player2EloAfter: 0,
        player1EloChange: 0,
        player2EloChange: 0,
        date: m.createdAt,
        context: m.tournamentName,
        player1Score: m.player1Score ?? m.participant1Score ?? null,
        player2Score: m.player2Score ?? m.participant2Score ?? null,
        player1Chars: m.player1Characters?.length ? m.player1Characters : charsWithColorsFromGames(m.games, 1),
        player2Chars: m.player2Characters?.length ? m.player2Characters : charsWithColorsFromGames(m.games, 2),
      };
    }
    if (row.kind === 'league') {
      const [s1, s2] = parseScoreString(m.score);
      return {
        id: row.id,
        type: 'league',
        gameId: row.gameId,
        player1Id: m.participant1Id,
        player2Id: m.participant2Id,
        winnerId: m.winnerId ?? '',
        player1Name: getParticipantName(m.participant1Id, allParticipants),
        player2Name: getParticipantName(m.participant2Id, allParticipants),
        player1Alias: aliasOf(m.participant1Id),
        player2Alias: aliasOf(m.participant2Id),
        player1EloBefore: m.participant1EloBefore ?? 0,
        player2EloBefore: m.participant2EloBefore ?? 0,
        player1EloAfter: (m.participant1EloBefore ?? 0) + (m.participant1EloChange ?? 0),
        player2EloAfter: (m.participant2EloBefore ?? 0) + (m.participant2EloChange ?? 0),
        player1EloChange: m.participant1EloChange ?? 0,
        player2EloChange: m.participant2EloChange ?? 0,
        date: m.completedDate ?? m.scheduledDate ?? new Date(0).toISOString(),
        context: leagueNameById.get(m.leagueId),
        player1Score: s1,
        player2Score: s2,
        player1Chars: charsWithColorsFromGames(m.games, 1),
        player2Chars: charsWithColorsFromGames(m.games, 2),
      };
    }
    return {
      id: row.id,
      type: row.type,
      gameId: row.gameId,
      player1Id: m.playerAId,
      player2Id: m.playerBId,
      winnerId: m.winnerId,
      player1Name: getParticipantName(m.playerAId, allParticipants),
      player2Name: getParticipantName(m.playerBId, allParticipants),
      player1Alias: aliasOf(m.playerAId),
      player2Alias: aliasOf(m.playerBId),
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
    };
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const matches = useMemo(() => list.items.map(toUnified), [list.items, allParticipants, leagueNameById]);

  // Chip counters: totals per enabled type (server counts; last known values offline)
  const countOf = (type: HistoryType): string => (counts ? ` (${counts[type]})` : '');
  const allCount = counts
    ? ` (${HISTORY_TYPES.filter((ty) => !typeDisabled(ty)).reduce((n, ty) => n + counts[ty], 0)})`
    : '';

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'tournament': return 'fa-trophy';
      case 'league': return 'fa-calendar-alt';
      case 'duel': return 'fa-khanda';
      case 'matchmaking': return 'fa-random';
      default: return 'fa-gamepad';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'tournament': return '#f59e0b';
      case 'league': return '#3b82f6';
      case 'duel': return '#8b5cf6';
      case 'matchmaking': return '#22c55e';
      default: return '#6b7280';
    }
  };

  return (
    <div className="history-tab">
      <div className="history-header">
        <div>
          <h1><i className="fas fa-history" /> {t('history.title')}</h1>
          <p className="text-secondary">{t('history.subtitle')}</p>
        </div>
        <PlayerDropdown
          participants={allParticipants}
          selectedId={selectedPlayerId}
          onSelect={setSelectedPlayerId}
          placeholder={t('history.allPlayers')}
        />
      </div>

      <div className="history-filters">
        <select
          className="history-game-filter"
          value={filterGameId ?? ''}
          onChange={(e) => setFilterGameId(e.target.value || null)}
        >
          <option value="">{t('history.allGames')}</option>
          {communityGames.map((g) => (
            <option key={g.id} value={g.id}>{g.id.toUpperCase()}</option>
          ))}
        </select>
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t('history.all')}{allCount}
        </button>
        {isFeatureEnabled('tournaments') && (
          <button
            className={`filter-btn ${filter === 'tournament' ? 'active' : ''}`}
            onClick={() => setFilter('tournament')}
          >
            <i className="fas fa-trophy" /> {t('history.tournaments')}{countOf('tournament')}
          </button>
        )}
        {isFeatureEnabled('leagues') && (
          <button
            className={`filter-btn ${filter === 'league' ? 'active' : ''}`}
            onClick={() => setFilter('league')}
          >
            <i className="fas fa-calendar-alt" /> {t('history.leagues')}{countOf('league')}
          </button>
        )}
        {isFeatureEnabled('duels') && (
          <button
            className={`filter-btn ${filter === 'duel' ? 'active' : ''}`}
            onClick={() => setFilter('duel')}
          >
            <i className="fas fa-khanda" /> {t('history.duels')}{countOf('duel')}
          </button>
        )}
        {isFeatureEnabled('matchmaking') && (
          <button
            className={`filter-btn ${filter === 'matchmaking' ? 'active' : ''}`}
            onClick={() => setFilter('matchmaking')}
          >
            <i className="fas fa-random" /> {t('history.matchmaking')}{countOf('matchmaking')}
          </button>
        )}
      </div>

      <div ref={listTopRef} />
      {list.loading && <Loading message={t('history.loading')} />}

      {list.unavailable && <OfflineNotice />}
      {list.incomplete && <OfflineNotice compact partial />}

      {list.error && (
        <div className="empty-state card">
          <i className="fas fa-triangle-exclamation" style={{ fontSize: '3rem', color: 'var(--danger-color)', marginBottom: '1rem' }} />
          <h3>{t('ranking.errorTitle')}</h3>
          <button className="btn-primary mt-2" onClick={list.reload}>{t('ranking.retry')}</button>
        </div>
      )}

      {!list.loading && !list.unavailable && !list.error && list.total === 0 && (
        <div className="empty-state card">
          <i className="fas fa-history" style={{ fontSize: '3rem', color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <h3>{t('history.empty', { context: filter !== 'all' ? t('history.emptyIn', { filter }) : t('history.emptyYet') })}</h3>
          <p className="text-secondary">
            {filter === 'duel' ? t('history.emptyDuelDesc') : t('history.emptyDefaultDesc')}
          </p>
          {filter === 'duel' && (
            <button className="btn-primary mt-2" onClick={() => navigate(getPath('events?tab=ranked'))}>
              <i className="fas fa-khanda" /> {t('history.goToRanked')}
            </button>
          )}
        </div>
      )}

      {matches.length > 0 && (
        <div className="history-list">
          {matches.map(match => (
            <div key={match.id} className="history-match-card card">
              <div className="match-banner" style={{ backgroundColor: getTypeColor(match.type) }}>
                <div className="match-banner-top">
                  <span className="match-banner-type">
                    <i className={`fas ${getTypeIcon(match.type)}`} />
                    {' '}{t(`history.${match.type}` as any, { defaultValue: match.type })}
                  </span>
                  {match.gameId && (
                    <span className="match-banner-game" style={gameBadgeStyle(match.gameId)}>
                      {match.gameId.toUpperCase()}
                    </span>
                  )}
                  <span className="match-banner-date">{formatDate(match.date)}</span>
                </div>
                {match.context && (
                  <div className="match-banner-context">
                  
                    {match.context}
                  </div>
                )}
              </div>

              <div className="match-players">
                <div className={`match-player ${match.winnerId === match.player1Id ? 'winner' : 'loser'}`}>
                  <div className="player-info">
                    {match.winnerId === match.player1Id && <i className="fas fa-crown winner-icon" />}
                    <PlayerDisplay name={match.player1Name} alias={match.player1Alias} />
                    <CharacterIcons gameId={match.gameId} characterIds={match.player1Chars} />
                  </div>
                  {match.type !== 'tournament' && (
                    <div className="player-elo">
                      <span className="elo-flow">
                        <span className="elo-before">{match.player1EloBefore}</span>
                        <i className="fas fa-arrow-right" />
                        <span className="elo-after">{match.player1EloAfter}</span>
                      </span>
                      <span className={`elo-change ${match.player1EloChange >= 0 ? 'positive' : 'negative'}`}>
                        {match.player1EloChange >= 0 ? '+' : ''}{match.player1EloChange}
                      </span>
                    </div>
                  )}
                </div>

                <div className={`match-vs ${match.player1Score !== null && match.player2Score !== null ? 'match-vs--score' : ''}`}>
                  {match.player1Score !== null && match.player2Score !== null ? (
                    <span className="match-score">
                      <span className={match.player1Score > match.player2Score ? 'ms-win' : 'ms-loss'}>{match.player1Score}</span>
                      <em>–</em>
                      <span className={match.player2Score > match.player1Score ? 'ms-win' : 'ms-loss'}>{match.player2Score}</span>
                    </span>
                  ) : t('rankingInfo.vs')}
                </div>

                <div className={`match-player ${match.winnerId === match.player2Id ? 'winner' : 'loser'}`}>
                  <div className="player-info">
                    <CharacterIcons gameId={match.gameId} characterIds={match.player2Chars} />
                    <PlayerDisplay name={match.player2Name} alias={match.player2Alias} />
                    {match.winnerId === match.player2Id && <i className="fas fa-crown winner-icon" />}
                  </div>
                  {match.type !== 'tournament' && (
                    <div className="player-elo">
                      <span className="elo-flow">
                        <span className="elo-before">{match.player2EloBefore}</span>
                        <i className="fas fa-arrow-right" />
                        <span className="elo-after">{match.player2EloAfter}</span>
                      </span>
                      <span className={`elo-change ${match.player2EloChange >= 0 ? 'positive' : 'negative'}`}>
                        {match.player2EloChange >= 0 ? '+' : ''}{match.player2EloChange}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination {...list.paginationProps} scrollRef={listTopRef} />
    </div>
  );
}

export default HistoryTab;
