import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCommunity } from '@/contexts/CommunityContext';
import { getAllTournamentMatchesAsync } from '@/services/tournament/tournamentService';
import { getAllMatches } from '@/services/ranking/rankingService';
import { getAllParticipants, getAllParticipantsAsync } from '@/services/participants/participantService';
import { MatchRecord, GlobalParticipant } from '@/models/types';
import { GAMES } from '@/data/games';
import PlayerDropdown from '@/components/PlayerDropdown/PlayerDropdown';
import Loading from '@/components/Loading/Loading';
import './HistoryTab.css';

type HistoryFilter = 'all' | 'tournament' | 'league' | 'duel' | 'matchmaking';

interface UnifiedMatch {
  id: string;
  type: 'tournament' | 'league' | 'duel' | 'matchmaking' | 'free';
  gameId?: string | null;
  player1Id: string;
  player2Id: string;
  winnerId: string;
  player1Name: string;
  player2Name: string;
  player1EloBefore: number;
  player2EloBefore: number;
  player1EloAfter: number;
  player2EloAfter: number;
  player1EloChange: number;
  player2EloChange: number;
  date: string;
  context?: string; // Tournament/League name
}

function HistoryTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentCommunity, getPath } = useCommunity();
  const communityId = currentCommunity?.id;
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [filterGameId, setFilterGameId] = useState<string | null>(null);
  const [matches, setMatches] = useState<UnifiedMatch[]>([]);
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [communityId]);

  const loadHistory = async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const [tournamentMatches, rankedMatches, participants] = await Promise.all([
        getAllTournamentMatchesAsync(communityId),
        getAllMatches(communityId),
        getAllParticipantsAsync(communityId).then(data => data.length > 0 ? data : getAllParticipants(communityId)),
      ]);

      setAllParticipants(participants);

      const globalById = new Map(participants.map((p: GlobalParticipant) => [p.id, p]));

      // Convert tournament matches - use stored global IDs
      const unifiedTournament: UnifiedMatch[] = tournamentMatches.map((m: any) => {
        const gP1 = m.player1GlobalId ? globalById.get(m.player1GlobalId) : null;
        const gP2 = m.player2GlobalId ? globalById.get(m.player2GlobalId) : null;

        return {
          id: m.id,
          type: 'tournament' as const,
          gameId: m.gameId,
          player1Id: gP1?.id ?? m.player1GlobalId ?? m.player1Id,
          player2Id: gP2?.id ?? m.player2GlobalId ?? m.player2Id,
          winnerId: gP1?.id ?? m.winnerGlobalId ?? m.winnerId,
          player1Name: gP1 ? `${gP1.name}${gP1.alias ? ` (${gP1.alias})` : ''}` : (m.player1Name || t('tournament.bracket.unknown')),
          player2Name: gP2 ? `${gP2.name}${gP2.alias ? ` (${gP2.alias})` : ''}` : (m.player2Name || t('tournament.bracket.unknown')),
          player1EloBefore: 0,
          player2EloBefore: 0,
          player1EloAfter: 0,
          player2EloAfter: 0,
          player1EloChange: 0,
          player2EloChange: 0,
          date: m.createdAt,
          context: m.tournamentName,
        };
      });

      // Convert ranking matches (duel/free/matchmaking)
      const unifiedRanked: UnifiedMatch[] = rankedMatches.map((m: MatchRecord) => ({
        id: m.id,
        type: (m.type as 'duel' | 'matchmaking' | 'free') ?? 'free',
        gameId: m.gameId,
        player1Id: m.playerAId,
        player2Id: m.playerBId,
        winnerId: m.winnerId,
        player1Name: getParticipantName(m.playerAId, participants),
        player2Name: getParticipantName(m.playerBId, participants),
        player1EloBefore: m.playerAPointsBefore,
        player2EloBefore: m.playerBPointsBefore,
        player1EloAfter: m.playerAPointsAfter,
        player2EloAfter: m.playerBPointsAfter,
        player1EloChange: m.playerADelta,
        player2EloChange: m.playerBDelta,
        date: m.createdAt,
      }));

      // TODO: Add league matches

      // Combine all sources and sort by date (newest first)
      const all = [...unifiedTournament, ...unifiedRanked].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setMatches(all);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const getParticipantName = (id: string, participants: GlobalParticipant[]): string => {
    const p = participants.find(p => p.id === id);
    return p ? `${p.name}${p.alias ? ` (${p.alias})` : ''}` : t('history.unknownPlayer');
  };

  // Apply type, player and game filters
  const filteredMatches = matches.filter(m => {
    const typeMatch = filter === 'all' || m.type === filter;
    const playerMatch = !selectedPlayerId || m.player1Id === selectedPlayerId || m.player2Id === selectedPlayerId;
    const gameMatch = !filterGameId || m.gameId === filterGameId;
    return typeMatch && playerMatch && gameMatch;
  });

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
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>{g.id.toUpperCase()}</option>
          ))}
        </select>
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          {t('history.all')} ({matches.length})
        </button>
        <button
          className={`filter-btn ${filter === 'tournament' ? 'active' : ''}`}
          onClick={() => setFilter('tournament')}
        >
          <i className="fas fa-trophy" /> {t('history.tournaments')} ({matches.filter(m => m.type === 'tournament').length})
        </button>
        <button
          className={`filter-btn ${filter === 'league' ? 'active' : ''}`}
          onClick={() => setFilter('league')}
        >
          <i className="fas fa-calendar-alt" /> {t('history.leagues')} ({matches.filter(m => m.type === 'league').length})
        </button>
        <button
          className={`filter-btn ${filter === 'duel' ? 'active' : ''}`}
          onClick={() => setFilter('duel')}
        >
          <i className="fas fa-swords" /> {t('history.duels')} ({matches.filter(m => m.type === 'duel').length})
        </button>
        <button
          className={`filter-btn ${filter === 'matchmaking' ? 'active' : ''}`}
          onClick={() => setFilter('matchmaking')}
        >
          <i className="fas fa-random" /> {t('history.matchmaking')} ({matches.filter(m => m.type === 'matchmaking').length})
        </button>
      </div>

      {loading && <Loading message={t('history.loading')} />}

      {!loading && filteredMatches.length === 0 && (
        <div className="empty-state card">
          <i className="fas fa-history" style={{ fontSize: '3rem', color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <h3>{t('history.empty', { context: filter !== 'all' ? t('history.emptyIn', { filter }) : t('history.emptyYet') })}</h3>
          <p className="text-secondary">
            {filter === 'duel' ? t('history.emptyDuelDesc') : t('history.emptyDefaultDesc')}
          </p>
          {filter === 'duel' && (
            <button className="btn-primary mt-2" onClick={() => navigate(getPath('events?tab=ranked'))}>
              <i className="fas fa-swords" /> {t('history.goToRanked')}
            </button>
          )}
        </div>
      )}

      {!loading && filteredMatches.length > 0 && (
        <div className="history-list">
          {filteredMatches.map(match => (
            <div key={match.id} className="history-match-card card">
              <div className="match-banner" style={{ backgroundColor: getTypeColor(match.type) }}>
                <div className="match-banner-top">
                  <span className="match-banner-type">
                    <i className={`fas ${getTypeIcon(match.type)}`} />
                    {' '}{t(`history.${match.type}` as any, { defaultValue: match.type })}
                  </span>
                  {match.gameId && (
                    <span className="match-banner-game">{match.gameId.toUpperCase()}</span>
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
                    <span className="player-name">{match.player1Name}</span>
                  </div>
                  {match.type !== 'tournament' && (
                    <div className="player-elo">
                      <span className="elo-before">{match.player1EloBefore}</span>
                      <i className="fas fa-arrow-right" />
                      <span className="elo-after">{match.player1EloAfter}</span>
                      <span className={`elo-change ${match.player1EloChange >= 0 ? 'positive' : 'negative'}`}>
                        {match.player1EloChange >= 0 ? '+' : ''}{match.player1EloChange}
                      </span>
                    </div>
                  )}
                </div>

                <div className="match-vs">{t('rankingInfo.vs')}</div>

                <div className={`match-player ${match.winnerId === match.player2Id ? 'winner' : 'loser'}`}>
                  <div className="player-info">
                    {match.winnerId === match.player2Id && <i className="fas fa-crown winner-icon" />}
                    <span className="player-name">{match.player2Name}</span>
                  </div>
                  {match.type !== 'tournament' && (
                    <div className="player-elo">
                      <span className="elo-before">{match.player2EloBefore}</span>
                      <i className="fas fa-arrow-right" />
                      <span className="elo-after">{match.player2EloAfter}</span>
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
    </div>
  );
}

export default HistoryTab;
