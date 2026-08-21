import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllMatches, type MatchRecord } from '@/services/ranking/rankingService';
import { getAllRankedMatchesAsync } from '@/services/ranked/rankedMatchService';
import { getAllParticipants } from '@/services/participants/participantService';
import { RankedMatch } from '@/models/rankedMatch';
import { GlobalParticipant } from '@/models/types';
import './HistoryTab.css';

type HistoryFilter = 'all' | 'tournament' | 'league' | 'duel' | 'matchmaking';

interface UnifiedMatch {
  id: string;
  type: 'tournament' | 'league' | 'duel' | 'matchmaking';
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
  const navigate = useNavigate();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [matches, setMatches] = useState<UnifiedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<GlobalParticipant[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const [rankingMatches, rankedMatches, allParticipants] = await Promise.all([
        getAllMatches(),
        getAllRankedMatchesAsync(),
        Promise.resolve(getAllParticipants()),
      ]);

      setParticipants(allParticipants);

      // Convert ranking matches (tournament/league)
      const unifiedRanking: UnifiedMatch[] = rankingMatches.map((m: MatchRecord) => ({
        id: m.id,
        type: 'tournament', // TODO: distinguish between tournament and league
        player1Id: m.playerAId,
        player2Id: m.playerBId,
        winnerId: m.winnerId,
        player1Name: getParticipantName(m.playerAId, allParticipants),
        player2Name: getParticipantName(m.playerBId, allParticipants),
        player1EloBefore: (m as any).playerAPointsBefore ?? 0,
        player2EloBefore: (m as any).playerBPointsBefore ?? 0,
        player1EloAfter: (m as any).playerAPointsAfter ?? 0,
        player2EloAfter: (m as any).playerBPointsAfter ?? 0,
        player1EloChange: (m as any).playerADelta ?? 0,
        player2EloChange: (m as any).playerBDelta ?? 0,
        date: m.createdAt,
      }));

      // Convert ranked matches (duel/matchmaking)
      const unifiedRanked: UnifiedMatch[] = rankedMatches.map((m: RankedMatch) => ({
        id: m.id,
        type: m.type,
        player1Id: m.player1Id,
        player2Id: m.player2Id,
        winnerId: m.winnerId,
        player1Name: getParticipantName(m.player1Id, allParticipants),
        player2Name: getParticipantName(m.player2Id, allParticipants),
        player1EloBefore: m.player1EloBefore,
        player2EloBefore: m.player2EloBefore,
        player1EloAfter: m.player1EloAfter,
        player2EloAfter: m.player2EloAfter,
        player1EloChange: m.player1EloChange,
        player2EloChange: m.player2EloChange,
        date: m.date,
      }));

      // Combine and sort by date (newest first)
      const all = [...unifiedRanking, ...unifiedRanked].sort(
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
    return p ? `${p.name}${p.alias ? ` (${p.alias})` : ''}` : 'Unknown';
  };

  const filteredMatches = filter === 'all' 
    ? matches 
    : matches.filter(m => m.type === filter);

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
      case 'duel': return 'fa-swords';
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
          <h1><i className="fas fa-history" /> Match History</h1>
          <p className="text-secondary">Complete history of all competitive matches</p>
        </div>
      </div>

      <div className="history-filters">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({matches.length})
        </button>
        <button 
          className={`filter-btn ${filter === 'tournament' ? 'active' : ''}`}
          onClick={() => setFilter('tournament')}
        >
          <i className="fas fa-trophy" /> Tournaments ({matches.filter(m => m.type === 'tournament').length})
        </button>
        <button 
          className={`filter-btn ${filter === 'league' ? 'active' : ''}`}
          onClick={() => setFilter('league')}
        >
          <i className="fas fa-calendar-alt" /> Leagues ({matches.filter(m => m.type === 'league').length})
        </button>
        <button 
          className={`filter-btn ${filter === 'duel' ? 'active' : ''}`}
          onClick={() => setFilter('duel')}
        >
          <i className="fas fa-swords" /> Duels ({matches.filter(m => m.type === 'duel').length})
        </button>
        <button 
          className={`filter-btn ${filter === 'matchmaking' ? 'active' : ''}`}
          onClick={() => setFilter('matchmaking')}
        >
          <i className="fas fa-random" /> Matchmaking ({matches.filter(m => m.type === 'matchmaking').length})
        </button>
      </div>

      {loading && (
        <div className="history-loading">
          <i className="fas fa-spinner fa-spin" /> Loading history...
        </div>
      )}

      {!loading && filteredMatches.length === 0 && (
        <div className="empty-state card">
          <i className="fas fa-history" style={{ fontSize: '3rem', color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <h3>No matches {filter !== 'all' ? `in ${filter}` : 'yet'}</h3>
          <p className="text-secondary">
            {filter === 'duel' ? 'Create challenges in Ranked Match to get started' : 'Play some matches to see them here'}
          </p>
          {filter === 'duel' && (
            <button className="btn-primary mt-2" onClick={() => navigate('/events?tab=ranked')}>
              <i className="fas fa-swords" /> Go to Ranked
            </button>
          )}
        </div>
      )}

      {!loading && filteredMatches.length > 0 && (
        <div className="history-list">
          {filteredMatches.map(match => (
            <div key={match.id} className="history-match-card card">
              <div className="match-header">
                <span 
                  className="match-type-badge" 
                  style={{ backgroundColor: getTypeColor(match.type) }}
                >
                  <i className={`fas ${getTypeIcon(match.type)}`} />
                  {' '}{match.type}
                </span>
                <span className="match-date">{formatDate(match.date)}</span>
              </div>

              <div className="match-players">
                <div className={`match-player ${match.winnerId === match.player1Id ? 'winner' : 'loser'}`}>
                  <div className="player-info">
                    {match.winnerId === match.player1Id && <i className="fas fa-crown winner-icon" />}
                    <span className="player-name">{match.player1Name}</span>
                  </div>
                  <div className="player-elo">
                    <span className="elo-before">{match.player1EloBefore}</span>
                    <i className="fas fa-arrow-right" />
                    <span className="elo-after">{match.player1EloAfter}</span>
                    <span className={`elo-change ${match.player1EloChange >= 0 ? 'positive' : 'negative'}`}>
                      {match.player1EloChange >= 0 ? '+' : ''}{match.player1EloChange}
                    </span>
                  </div>
                </div>

                <div className="match-vs">VS</div>

                <div className={`match-player ${match.winnerId === match.player2Id ? 'winner' : 'loser'}`}>
                  <div className="player-info">
                    {match.winnerId === match.player2Id && <i className="fas fa-crown winner-icon" />}
                    <span className="player-name">{match.player2Name}</span>
                  </div>
                  <div className="player-elo">
                    <span className="elo-before">{match.player2EloBefore}</span>
                    <i className="fas fa-arrow-right" />
                    <span className="elo-after">{match.player2EloAfter}</span>
                    <span className={`elo-change ${match.player2EloChange >= 0 ? 'positive' : 'negative'}`}>
                      {match.player2EloChange >= 0 ? '+' : ''}{match.player2EloChange}
                    </span>
                  </div>
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
