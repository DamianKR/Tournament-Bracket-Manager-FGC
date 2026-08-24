import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GlobalParticipant, ComputedStats, LeagueResultEntry, MatchRecord } from '@/models/types';
import {
  getParticipant,
  computeStats,
  updateParticipant,
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [participant, setParticipant] = useState<GlobalParticipant | null>(null);
  const [stats, setStats] = useState<ComputedStats | null>(null);
  const [leagueStats, setLeagueStats] = useState<LeagueStatsSummary | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [resultsSubTab, setResultsSubTab] = useState<'tournaments' | 'leagues'>('tournaments');
  const [notFound, setNotFound] = useState(false);
  const [rankEntry, setRankEntry] = useState<LeaderboardEntry | null>(null);
  const [duelStats, setDuelStats] = useState({ challengesThisWeek: 0, maxChallengesPerWeek: 10, pendingChallenges: 0, completedThisWeek: 0 });
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
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [tournaments, ls] = await Promise.all([
          loadTournamentsForParticipantAsync(id),
          getParticipantLeagueStats(id),
        ]);
        const p = getParticipant(id);
        if (!p) { setNotFound(true); return; }
        setParticipant(p);
        setStats(computeStats(p, tournaments));
        setLeagueStats(ls);
        setEditName(p.name);
        setEditAlias(p.alias ?? '');
        setEditGameId(p.gameId ?? null);
        setEditCharacterId(p.mainCharacterId ?? null);
      } catch {
        const p = getParticipant(id);
        if (!p) { setNotFound(true); return; }
        setParticipant(p);
        setStats(computeStats(p));
        setLeagueStats({ leagues: [], totalMatches: 0, totalWins: 0, totalLosses: 0, winRate: 0 });
      }

      // Load ELO ranking entry (fire-and-forget — graceful if server is down)
      getLeaderboard().then((board) => {
        const entry = board.find((e) => e.id === id) ?? null;
        setRankEntry(entry);
      }).catch(() => {});

      // Load duel stats
      getDuelStats(id).then(dStats => {
        setDuelStats(dStats);
      });
      
      // Load next reset time
      getDuelSettingsAsync().then(settings => {
        const nextReset = getNextWeeklyReset(settings);
        setNextResetText(formatTimeUntilReset(nextReset));
      });
    })();
  }, [id]);

  // Load matches when Matches tab is opened
  useEffect(() => {
    if (tab === 'matches' && id && allMatches.length === 0) {
      loadMatches();
    }
  }, [tab, id]);

  async function loadMatches() {
    if (!id) return;
    setLoadingMatches(true);
    try {
      const [tournamentMatches, rankedMatches, allParticipants] = await Promise.all([
        getAllTournamentMatchesAsync(),
        getAllMatches(),
        getAllParticipantsAsync().then(data => data.length > 0 ? data : []),
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
              player1Name: gP1 ? `${gP1.name}${gP1.alias ? ` (${gP1.alias})` : ''}` : (m.player1Name || 'Unknown'),
              player2Name: gP2 ? `${gP2.name}${gP2.alias ? ` (${gP2.alias})` : ''}` : (m.player2Name || 'Unknown'),
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
            player1Name: participantMap.get(m.playerAId) ? `${participantMap.get(m.playerAId)!.name}${participantMap.get(m.playerAId)!.alias ? ` (${participantMap.get(m.playerAId)!.alias})` : ''}` : 'Unknown',
            player2Name: participantMap.get(m.playerBId) ? `${participantMap.get(m.playerBId)!.name}${participantMap.get(m.playerBId)!.alias ? ` (${participantMap.get(m.playerBId)!.alias})` : ''}` : 'Unknown',
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
    setSaving(true); setEditError('');
    try {
      const updated = await updateParticipant(participant.id, {
        name: editName,
        alias: editAlias,
        gameId: editGameId,
        mainCharacterId: editCharacterId,
      });
      setParticipant(updated);
      setStats(computeStats(updated));
      setTab('overview');
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="empty-state card">
            <h3>Participant not found</h3>
            <button className="btn-outline mt-2" onClick={() => navigate('/participants')}>
              ← Back to roster
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!participant || !stats) {
    return <div className="profile-page"><div className="container profile-loading">Loading…</div></div>;
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
          <button className="profile-back-btn" onClick={() => navigate('/participants')}>
            ← Roster
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
                  Member since {new Date(participant.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* ELO Rank widget — right side of banner */}
            {(() => {
              const hasPts = (rankEntry?.eloPoints ?? participant.eloPoints) != null;
              const pts   = hasPts ? (rankEntry?.eloPoints ?? participant.eloPoints) : null;
              const rank  = rankEntry?.displayRank ?? participant.eloRank ?? 'Sin puntos';
              const pos   = rankEntry?.position;
              const col   = getRankColor(rank);
              const icon  = getRankIcon(rank);
              return (
                <div
                  className="profile-elo-widget"
                  style={{ '--elo-color': col } as React.CSSProperties}
                  onClick={() => navigate('/ranking')}
                  title="View full ranking"
                >
                  {/* Glow layer */}
                  <div className="pew-glow" />

                  {/* Top: label */}
                  <div className="pew-label">ELO RANKING</div>

                  {/* Center: icon + rank name */}
                  <div className="pew-center">
                    <span className={`pew-icon ${rank === 'Legend' ? 'pew-icon--legend' : ''}`}>
                      <i className={rank === 'Legend' ? 'fas fa-dragon' : icon} />
                    </span>
                    <span className="pew-rank">{rank}</span>
                  </div>

                  {/* Divider */}
                  <div className="pew-divider" />

                  {/* Bottom row: pts left, position right */}
                  <div className="pew-bottom">
                    <div className="pew-pts-block">
                      <span className="pew-pts-value">{pts != null ? pts.toLocaleString() : '—'}</span>
                      <span className="pew-pts-label">{pts != null ? 'points' : 'unranked'}</span>
                    </div>
                    {pos != null && (
                      <div className="pew-pos-block">
                        <span className="pew-pos-value">#{pos}</span>
                        <span className="pew-pos-label">ranking</span>
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
          {(['overview', 'results', 'matches', 'edit'] as Tab[]).map((t) => (
            <button key={t} className={`profile-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' 
                : t === 'results' ? `Results`
                : t === 'matches' ? 'Matches'
                : 'Edit'}
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
                <span className="psc-label"><i className="fas fa-trophy" /> Tournament Wins</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.tournamentsPlayed}</span>
                <span className="psc-label">Tournaments Played</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.top3}</span>
                <span className="psc-label">Top 3 Finishes</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.winRate > 0 ? `${stats.winRate}%` : '—'}</span>
                <span className="psc-label">Match Win Rate</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.matchWins}</span>
                <span className="psc-label">Match Wins</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.matchLosses}</span>
                <span className="psc-label">Match Losses</span>
              </div>
            </div>

            {/* Tournament Match Record */}
            {(stats.matchWins + stats.matchLosses) > 0 && (
              <div className="card profile-winrate-card">
                <div className="profile-winrate-header">
                  <span><i className="fas fa-trophy" /> Tournament Match Record</span>
                  <span>{stats.matchWins}W – {stats.matchLosses}L</span>
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
                  <span className="psc-label"><i className="fas fa-trophy" /> League Wins</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leaguesWithMatches}</span>
                  <span className="psc-label">Leagues Played</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueTop5}</span>
                  <span className="psc-label">Top 5 in Leagues</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.winRate > 0 ? `${leagueStats.winRate}%` : '—'}</span>
                  <span className="psc-label">League Match Win Rate</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.totalWins}</span>
                  <span className="psc-label">League Match Wins</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.totalLosses}</span>
                  <span className="psc-label">League Match Losses</span>
                </div>
              </div>
            )}

            {/* League Match Record */}
            {leagueStats && (
              <div className="card profile-winrate-card profile-winrate-card--league">
                <div className="profile-winrate-header">
                  <span><i className="fas fa-trophy" /> League Match Record</span>
                  <span>{leagueStats.totalWins}W – {leagueStats.totalLosses}L</span>
                </div>
                <div className="profile-winrate-bar">
                  <div className="profile-winrate-fill" style={{ width: `${leagueStats.winRate}%` }} />
                </div>
              </div>
            )}

            {/* Ranked Duels Stats */}
            <div className="card profile-duels-card">
              <div className="profile-duels-header">
                <h3><i className="fas fa-swords" /> Ranked Duels</h3>
                <button 
                  className="btn-outline btn-sm"
                  onClick={() => navigate('/events?tab=ranked')}
                >
                  Challenge Players →
                </button>
              </div>
              <div className="profile-stat-grid">
                <div className="profile-stat-card profile-stat-card--duel">
                  <span className="psc-value">
                    {duelStats.maxChallengesPerWeek - duelStats.challengesThisWeek}
                  </span>
                  <span className="psc-label">
                    <i className="fas fa-fire" /> Duels Available This Week
                  </span>
                  <span className="psc-sublabel">
                    {duelStats.challengesThisWeek} / {duelStats.maxChallengesPerWeek} used
                    {nextResetText && <span className="reset-timer">Resets in {nextResetText}</span>}
                  </span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{duelStats.pendingChallenges}</span>
                  <span className="psc-label">Pending Challenges</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{duelStats.completedThisWeek}</span>
                  <span className="psc-label">Duels This Week</span>
                </div>
              </div>
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
                <i className="fas fa-trophy" /> Tournaments ({stats.placements.length})
              </button>
              <button
                className={`results-subtab ${resultsSubTab === 'leagues' ? 'active' : ''}`}
                onClick={() => setResultsSubTab('leagues')}
              >
                <i className="fas fa-trophy" /> Leagues ({leagueStats?.leagues.length ?? 0})
              </button>
            </div>

            {resultsSubTab === 'tournaments' && (
              <>
                <h3 className="mb-3">Tournament Results</h3>
                {stats.placements.length === 0 ? (
                  <p className="text-secondary">No tournament results yet.</p>
                ) : (
                  <div className="profile-results-list">
                    {stats.placements.map((pl) => (
                      <div key={pl.tournamentId} className="profile-result-row"
                        onClick={() => navigate(`/tournament/${pl.tournamentId}`)}>
                        <span className="prr-medal">{PLACEMENT_MEDAL[pl.position] ?? <i className="fas fa-gamepad" />}</span>
                        <div className="prr-info">
                          <span className="prr-name">{pl.tournamentName}</span>
                          <span className="prr-meta text-secondary text-sm">
                            {pl.totalParticipants} players · {new Date(pl.date).toLocaleDateString()}
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
                <h3 className="mb-3">League Results</h3>
                {(leagueStats?.leagues.length ?? 0) === 0 ? (
                  <p className="text-secondary">No league results yet.</p>
                ) : (
                  <div className="profile-results-list">
                    {leagueStats!.leagues.map((pl: LeagueResultEntry) => (
                      <div key={pl.leagueId} className="profile-result-row"
                        onClick={() => navigate(`/leagues/${pl.leagueId}`)}>
                        <span className={`prr-medal prr-rank rank-${pl.rank}`}>
                          {pl.rank <= 3 ? PLACEMENT_MEDAL[pl.rank] : pl.rank}
                        </span>
                        <div className="prr-info">
                          <span className="prr-name">{pl.leagueName}</span>
                          <span className="prr-meta text-secondary text-sm">
                            {pl.wins}W – {pl.losses}L · {pl.matchesPlayed} matches · ELO {pl.eloChange >= 0 ? '+' : ''}{pl.eloChange}
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
            <h3 className="mb-3">Match History</h3>
            
            <div className="matches-filters">
              <div className="matches-filter-group">
                <label>Type:</label>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${matchTypeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setMatchTypeFilter('all')}
                  >
                    All
                  </button>
                  <button
                    className={`filter-btn ${matchTypeFilter === 'tournament' ? 'active' : ''}`}
                    onClick={() => setMatchTypeFilter('tournament')}
                  >
                    <i className="fas fa-trophy" /> Tournament
                  </button>
                  <button
                    className={`filter-btn ${matchTypeFilter === 'league' ? 'active' : ''}`}
                    onClick={() => setMatchTypeFilter('league')}
                  >
                    <i className="fas fa-calendar-alt" /> League
                  </button>
                  <button
                    className={`filter-btn ${matchTypeFilter === 'duel' ? 'active' : ''}`}
                    onClick={() => setMatchTypeFilter('duel')}
                  >
                    <i className="fas fa-swords" /> Duel
                  </button>
                </div>
              </div>

              <div className="matches-filter-group">
                <label>Result:</label>
                <div className="filter-buttons">
                  <button
                    className={`filter-btn ${matchResultFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setMatchResultFilter('all')}
                  >
                    All
                  </button>
                  <button
                    className={`filter-btn ${matchResultFilter === 'wins' ? 'active' : ''}`}
                    onClick={() => setMatchResultFilter('wins')}
                  >
                    <i className="fas fa-trophy" /> Wins
                  </button>
                  <button
                    className={`filter-btn ${matchResultFilter === 'losses' ? 'active' : ''}`}
                    onClick={() => setMatchResultFilter('losses')}
                  >
                    <i className="fas fa-times" /> Losses
                  </button>
                </div>
              </div>
            </div>

            {loadingMatches && (
              <div className="matches-loading">
                <i className="fas fa-spinner fa-spin" /> Loading matches...
              </div>
            )}

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
                  <p className="text-secondary">No matches found with current filters.</p>
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
                            {won ? <><i className="fas fa-trophy" /> WIN</> : <><i className="fas fa-times" /> LOSS</>}
                          </span>
                          <span className="match-item-type">
                            {m.type === 'tournament' && <><i className="fas fa-trophy" /> Tournament</>}
                            {m.type === 'league' && <><i className="fas fa-calendar-alt" /> League</>}
                            {m.type === 'duel' && <><i className="fas fa-swords" /> Duel</>}
                            {m.type === 'matchmaking' && <><i className="fas fa-random" /> Matchmaking</>}
                            {m.type === 'free' && <><i className="fas fa-gamepad" /> Ranked</>}
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
                            <span className="match-item-vs">vs</span>
                            <span 
                              className="match-item-opponent-name"
                              onClick={() => navigate(`/participants/${opponentId}`)}
                            >
                              {opponentName || 'Unknown'}
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
        {tab === 'edit' && (
          <div className="card profile-edit-form">
            <h3>Edit Profile</h3>
            {editError && <div className="error-message">{editError}</div>}
            <div className="profile-edit-grid">
              <div className="form-group">
                <label>Name *</label>
                <input type="text" value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="Player name" />
              </div>
              <div className="form-group">
                <label>Alias / Gamertag</label>
                <input type="text" value={editAlias}
                  onChange={(e) => setEditAlias(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="Optional short name" />
              </div>
            </div>
            <CharacterSelect
              gameId={editGameId}
              characterId={editCharacterId}
              onGameChange={setEditGameId}
              onCharacterChange={setEditCharacterId}
            />
            <div className="form-actions">
              <button className="btn-outline" onClick={() => setTab('overview')}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ParticipantProfile;
