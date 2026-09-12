import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ParticipantStatsSummary } from '@/services/participants/participantService';
import { GlobalParticipant } from '@/models/types';
import { getCharacter, getGame, GAMES } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import { gameBadgeStyle } from '@/utils/gameColor';
import './ParticipantStatsOverview.css';

interface ParticipantStatsOverviewProps {
  stats: ParticipantStatsSummary | null;
  participant: GlobalParticipant | null;
  leagueStats?: { leagues: { status: string; rank: number }[] } | null;
  duelStats?: { pendingChallenges: number; completedThisWeek: number } | null;
}

type H2HTab = 'players' | 'characters';
type H2HType = 'all' | 'tournament' | 'ranked' | 'league';
type RecordTab = 'total' | 'game' | 'type';

function RecordBar({ label, wins, losses, winRate, color }: { label: string; wins: number; losses: number; winRate: number; color?: string }) {
  return (
    <div className="record-bar-row">
      <div className="record-bar-header">
        <span className="record-bar-label">{label}</span>
        <span className="record-bar-meta">{winRate}% · {wins}W / {losses}L</span>
      </div>
      <div className="record-bar-track">
        <div className="record-bar-fill" style={{ width: `${winRate}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function StatCard({ label, children, className = '', style }: { label: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`stat-card ${className}`} style={style}>
      <div className="stat-card-label">{label}</div>
      {children}
    </div>
  );
}

function GameBadge({ gameId }: { gameId: string }) {
  const game = getGame(gameId);
  return (
    <span className="game-badge" style={gameBadgeStyle(gameId)}>
      {game?.id?.toUpperCase() || gameId}
    </span>
  );
}

function CharacterRow({ gameId, characterId, label, wins, losses, winRate, count, total }: {
  gameId: string;
  characterId: string;
  label?: string;
  wins: number;
  losses: number;
  winRate: number;
  count: number;
  total: number;
}) {
  const ch = getCharacter(gameId, characterId);
  const usagePercent = total > 0 ? Math.round((count / total) * 100) : 0;
  const displayName = ch?.name || label || characterId;

  return (
    <div className="character-row">
      <img
        src={getCharacterImageUrl(gameId, characterId) ?? undefined}
        alt={displayName}
        className="character-row-icon"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="character-row-info">
        <div className="character-row-header">
          <span className="character-row-name">{displayName}</span>
          <span className="character-row-meta">{count} {usagePercent > 0 ? `(${usagePercent}%)` : ''} · {wins}W / {losses}L · {winRate}% WR</span>
        </div>
        <div className="character-row-bar">
          <div className="character-row-fill" style={{ width: `${usagePercent}%` }} />
        </div>
      </div>
    </div>
  );
}

function H2HRow({ name, sub, wins, losses, winRate }: { name: string; sub?: string; wins: number; losses: number; winRate: number }) {
  return (
    <div className="h2h-row">
      <div className="h2h-info">
        <span className="h2h-name">{name}</span>
        {sub && <span className="h2h-sub">{sub}</span>}
      </div>
      <div className="h2h-record">
        <span>{wins} - {losses}</span>
        <span className="h2h-wr">{winRate}%</span>
      </div>
    </div>
  );
}

function groupBy<T extends object, K extends keyof T>(arr: T[], key: K): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    acc[k] = acc[k] || [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function ParticipantStatsOverview({ stats, participant, leagueStats, duelStats }: ParticipantStatsOverviewProps) {
  const { t } = useTranslation();
  const [h2hTab, setH2hTab] = useState<H2HTab>('players');
  const [h2hType, setH2hType] = useState<H2HType>('all');
  const [h2hPlayerFilter, setH2hPlayerFilter] = useState<string>('');
  const [h2hMyCharFilter, setH2hMyCharFilter] = useState<string>('');
  const [h2hOppCharFilter, setH2hOppCharFilter] = useState<string>('');
  const [recordTab, setRecordTab] = useState<RecordTab>('total');
  const [usageGameFilter, setUsageGameFilter] = useState<string>('');
  const [activityType, setActivityType] = useState<string>('all');

  if (!stats || !participant) return null;

  const peakElo = stats.peakEloByGame[0];
  const totalGames = stats.peakEloByGame.length;
  const usageByGame = useMemo(() => groupBy(stats.characterUsage, 'gameId'), [stats.characterUsage]);
  const gamesWithUsage = Object.keys(usageByGame);
  const hasCharacterData = stats.characterUsage.length > 0;
  const selectedUsageGame = usageGameFilter || gamesWithUsage[0] || GAMES[0]?.id || '';
  const selectedUsageChars = selectedUsageGame ? (usageByGame[selectedUsageGame] ?? []) : [];
  const selectedUsageTotal = selectedUsageChars.reduce((sum, c) => sum + c.count, 0);

  const currentH2HPlayers = useMemo(() => {
    let list = h2hType === 'all' ? stats.headToHead : (stats.headToHeadByType[h2hType] ?? []);
    if (h2hPlayerFilter) {
      list = list.filter((h) => h.id === h2hPlayerFilter);
    }
    return list;
  }, [stats.headToHead, stats.headToHeadByType, h2hType, h2hPlayerFilter]);

  const currentMatchups = useMemo(() => {
    let list = stats.matchupWinRates;
    if (h2hMyCharFilter) {
      list = list.filter((m) => m.characterId === h2hMyCharFilter);
    }
    if (h2hOppCharFilter) {
      list = list.filter((m) => m.opponentCharacterId === h2hOppCharFilter);
    }
    if (h2hType !== 'all') {
      list = list.map((m) => {
        const t = m.byType[h2hType];
        return { ...m, wins: t.wins, losses: t.losses, winRate: t.wins + t.losses > 0 ? Math.round((t.wins / (t.wins + t.losses)) * 100) : 0 };
      }).filter((m) => m.wins + m.losses > 0);
    }
    return list;
  }, [stats.matchupWinRates, h2hMyCharFilter, h2hOppCharFilter, h2hType]);

  return (
    <div className="participant-stats-overview">
      {/* Performance */}
      <div className="stats-overview-grid">
        <StatCard label={t('participantProfile.stats.peakElo')} className="peak-elo-card" style={{ '--rank-color': peakElo?.color } as React.CSSProperties}>
          {peakElo ? (
            <div className="peak-elo-content">
              <div className="peak-elo-main">
                <span className="peak-elo-rank" style={{ color: peakElo.color }}>{peakElo.rank}</span>
                <span className="peak-elo-points">{peakElo.points} pts</span>
              </div>
              <div className="peak-elo-game"><GameBadge gameId={peakElo.gameId} /></div>
              {totalGames > 1 && (
                <div className="peak-elo-others">
                  {stats.peakEloByGame.slice(1).map((g) => (
                    <span key={g.gameId} className="peak-elo-other">
                      <GameBadge gameId={g.gameId} /> {g.rank} ({g.points})
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="stat-empty">{t('participantProfile.stats.noData')}</span>
          )}
        </StatCard>

        <StatCard label={t('participantProfile.stats.placements')} className="placements-card">
          <div className="placements-list">
            <div className="placement-pill gold">
              <span className="placement-medal">🥇</span>
              <span className="placement-count">{stats.topPlacements.top1}</span>
              <small>1st</small>
            </div>
            <div className="placement-pill silver">
              <span className="placement-medal">🥉</span>
              <span className="placement-count">{stats.topPlacements.top3}</span>
              <small>Top 3</small>
            </div>
            <div className="placement-pill">
              <span className="placement-count">{stats.topPlacements.top8}</span>
              <small>Top 8</small>
            </div>
            <div className="placement-pill">
              <span className="placement-count">{stats.topPlacements.top16}</span>
              <small>Top 16</small>
            </div>
          </div>
        </StatCard>

        <StatCard label={t('participantProfile.stats.matchRecord')} className="record-card record-card--full">
          <div className="record-tabs">
            <button className={`record-tab ${recordTab === 'total' ? 'active' : ''}`} onClick={() => setRecordTab('total')}>
              {t('participantProfile.stats.total')}
            </button>
            <button className={`record-tab ${recordTab === 'game' ? 'active' : ''}`} onClick={() => setRecordTab('game')}>
              {t('participantProfile.stats.byGame')}
            </button>
            <button className={`record-tab ${recordTab === 'type' ? 'active' : ''}`} onClick={() => setRecordTab('type')}>
              {t('participantProfile.stats.byType')}
            </button>
          </div>
          <div className="record-content">
            {recordTab === 'total' && (
              <>
                <RecordBar
                  label={t('participantProfile.stats.total')}
                  wins={stats.allMatchWins}
                  losses={stats.allMatchLosses}
                  winRate={stats.allMatchWinRate}
                />
                <div className="record-extra-stats">
                  <div className="record-extra-stat">
                    <span className="record-extra-value">{stats.allMatchWins + stats.allMatchLosses}</span>
                    <span className="record-extra-label">{t('participantProfile.stats.matchesPlayed')}</span>
                  </div>
                  <div className="record-extra-stat">
                    <span className="record-extra-value">{stats.topPlacements.top1}</span>
                    <span className="record-extra-label">{t('participantProfile.stats.tournamentWins')}</span>
                  </div>
                  <div className="record-extra-stat">
                    <span className="record-extra-value">{leagueStats?.leagues.filter((l) => l.rank === 1).length ?? 0}</span>
                    <span className="record-extra-label">{t('participantProfile.stats.leagueWins')}</span>
                  </div>
                  <div className="record-extra-stat">
                    <span className="record-extra-value">{stats.topPlacements.top3}</span>
                    <span className="record-extra-label">{t('participantProfile.stats.top3')}</span>
                  </div>
                </div>
              </>
            )}
            {recordTab === 'game' && (
              <div className="record-list">
                {(stats.recordByGame ?? []).length > 0 ? (
                  stats.recordByGame.map((g) => (
                    <RecordBar
                      key={g.gameId}
                      label={getGame(g.gameId)?.name || g.gameId}
                      wins={g.wins}
                      losses={g.losses}
                      winRate={g.winRate}
                    />
                  ))
                ) : (
                  <span className="stat-empty">{t('participantProfile.stats.noData')}</span>
                )}
              </div>
            )}
            {recordTab === 'type' && (
              <div className="record-list">
                {(stats.recordByType ?? []).length > 0 ? (
                  stats.recordByType.map((rt) => (
                    <div key={rt.type} className="record-type-row">
                      <RecordBar
                        label={t(`participantProfile.stats.${rt.type}`)}
                        wins={rt.wins}
                        losses={rt.losses}
                        winRate={rt.winRate}
                      />
                      <div className="record-type-extra">
                        {rt.type === 'tournament' && (
                          <>
                            <span><strong>{stats.topPlacements.top1}</strong> {t('participantProfile.stats.tournamentWins')}</span>
                            <span><strong>{stats.topPlacements.top3}</strong> {t('participantProfile.stats.top3')}</span>
                          </>
                        )}
                        {rt.type === 'league' && (
                          <>
                            <span><strong>{leagueStats?.leagues.filter((l) => l.rank === 1).length ?? 0}</strong> {t('participantProfile.stats.leagueWins')}</span>
                            <span><strong>{leagueStats?.leagues.filter((l) => l.rank <= 5).length ?? 0}</strong> {t('participantProfile.stats.top5')}</span>
                          </>
                        )}
                        {rt.type === 'ranked' && (
                          <>
                            <span><strong>{duelStats?.pendingChallenges ?? 0}</strong> {t('participantProfile.stats.pending')}</span>
                            <span><strong>{duelStats?.completedThisWeek ?? 0}</strong> {t('participantProfile.stats.thisWeek')}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="stat-empty">{t('participantProfile.stats.noData')}</span>
                )}
              </div>
            )}
          </div>
        </StatCard>
      </div>

      {/* Characters */}
      <div className="stats-section card characters-section">
        <div className="stats-section-header">
          <h3>{t('participantProfile.stats.charactersSection')}</h3>
        </div>
        <div className="characters-grid">
          <div className="mains-card">
            <div className="mains-label">{t('participantProfile.stats.mains')}</div>
            <div className="mains-list">
              {Object.entries(stats.mainCharactersByGame).map(([gameId, char]) => {
                const ch = getCharacter(gameId, char.id);
                return (
                  <div key={gameId} className="main-char-row">
                    <img
                      src={getCharacterImageUrl(gameId, char.id) ?? undefined}
                      alt={ch?.name || char.id}
                      className="main-char-row-icon"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <span className="main-char-row-name">{ch?.name || char.id}</span>
                    <GameBadge gameId={gameId} />
                  </div>
                );
              })}
              {Object.keys(stats.mainCharactersByGame).length === 0 && (
                <span className="stat-empty">{t('participantProfile.stats.noData')}</span>
              )}
            </div>
          </div>

          <div className="usage-card">
            <div className="usage-header">
              <div className="mains-label">{t('participantProfile.stats.characterUsage')}</div>
              <select
                className="usage-game-select"
                value={selectedUsageGame}
                onChange={(e) => setUsageGameFilter(e.target.value)}
              >
                {GAMES.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            {hasCharacterData ? (
              <div className="character-usage-game">
                <h4 className="character-usage-game-title">
                  <GameBadge gameId={selectedUsageGame} />
                  <span>{getGame(selectedUsageGame)?.name || selectedUsageGame}</span>
                </h4>
                {selectedUsageChars.length > 0 ? (
                  <div className="character-usage-list">
                    {selectedUsageChars.map((c) => (
                      <CharacterRow
                        key={`${c.gameId}:${c.characterId}`}
                        gameId={c.gameId}
                        characterId={c.characterId}
                        wins={c.wins}
                        losses={c.losses}
                        winRate={c.winRate}
                        count={c.count}
                        total={selectedUsageTotal}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="stat-empty">{t('participantProfile.stats.noCharacterData')}</div>
                )}
              </div>
            ) : (
              <div className="stat-empty">{t('participantProfile.stats.noCharacterData')}</div>
            )}
          </div>
        </div>
      </div>

      {/* Head to head */}
      <div className="stats-section card h2h-section">
        <div className="stats-section-header">
          <h3>{t('participantProfile.stats.headToHead')}</h3>
          <div className="h2h-tabs">
            <button className={`h2h-tab ${h2hTab === 'players' ? 'active' : ''}`} onClick={() => setH2hTab('players')}>
              {t('participantProfile.stats.players')}
            </button>
            <button className={`h2h-tab ${h2hTab === 'characters' ? 'active' : ''}`} onClick={() => setH2hTab('characters')}>
              {t('participantProfile.stats.characters')}
            </button>
          </div>
        </div>

        {h2hTab === 'players' && (
          <>
            <p className="h2h-info-note">{t('participantProfile.stats.h2hPlayersNote')}</p>
            <div className="h2h-filters">
              <div className="h2h-filter-row">
                <select
                  className="h2h-filter-select"
                  value={h2hPlayerFilter}
                  onChange={(e) => setH2hPlayerFilter(e.target.value)}
                >
                  <option value="">{t('participantProfile.stats.allPlayers')}</option>
                  {stats.headToHead.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div className="h2h-type-tabs">
                <button className={`h2h-type-tab ${h2hType === 'all' ? 'active' : ''}`} onClick={() => setH2hType('all')}>
                  {t('participantProfile.stats.all')}
                </button>
                <button className={`h2h-type-tab ${h2hType === 'tournament' ? 'active' : ''}`} onClick={() => setH2hType('tournament')}>
                  {t('participantProfile.stats.tournament')}
                </button>
                <button className={`h2h-type-tab ${h2hType === 'ranked' ? 'active' : ''}`} onClick={() => setH2hType('ranked')}>
                  {t('participantProfile.stats.ranked')}
                </button>
                <button className={`h2h-type-tab ${h2hType === 'league' ? 'active' : ''}`} onClick={() => setH2hType('league')}>
                  {t('participantProfile.stats.league')}
                </button>
              </div>
            </div>
            {currentH2HPlayers.length > 0 ? (
              <div className="h2h-list">
                {currentH2HPlayers.map((h) => (
                  <H2HRow
                    key={h.id}
                    name={h.name}
                    sub={h.alias || undefined}
                    wins={h.wins}
                    losses={h.losses}
                    winRate={h.winRate}
                  />
                ))}
              </div>
            ) : (
              <div className="stat-empty">{t('participantProfile.stats.noData')}</div>
            )}
          </>
        )}

        {h2hTab === 'characters' && (
          <>
            <p className="h2h-info-note">{t('participantProfile.stats.h2hCharactersNote')}</p>
            <div className="h2h-filters">
              <div className="h2h-filter-row">
                <select
                  className="h2h-filter-select"
                  value={h2hMyCharFilter}
                  onChange={(e) => setH2hMyCharFilter(e.target.value)}
                >
                  <option value="">{t('participantProfile.stats.myCharacter')}</option>
                  {Array.from(new Set(stats.matchupWinRates.map((m) => m.characterId))).map((charId) => {
                    const m = stats.matchupWinRates.find((x) => x.characterId === charId);
                    const ch = getCharacter(m?.gameId || '', charId);
                    return <option key={charId} value={charId}>{ch?.name || charId}</option>;
                  })}
                </select>
                <select
                  className="h2h-filter-select"
                  value={h2hOppCharFilter}
                  onChange={(e) => setH2hOppCharFilter(e.target.value)}
                >
                  <option value="">{t('participantProfile.stats.opponentCharacter')}</option>
                  {Array.from(new Set(stats.matchupWinRates.map((m) => m.opponentCharacterId))).map((charId) => {
                    const m = stats.matchupWinRates.find((x) => x.opponentCharacterId === charId);
                    const ch = getCharacter(m?.gameId || '', charId);
                    return <option key={charId} value={charId}>{ch?.name || charId}</option>;
                  })}
                </select>
              </div>
              <div className="h2h-type-tabs">
                <button className={`h2h-type-tab ${h2hType === 'all' ? 'active' : ''}`} onClick={() => setH2hType('all')}>
                  {t('participantProfile.stats.all')}
                </button>
                <button className={`h2h-type-tab ${h2hType === 'tournament' ? 'active' : ''}`} onClick={() => setH2hType('tournament')}>
                  {t('participantProfile.stats.tournament')}
                </button>
                <button className={`h2h-type-tab ${h2hType === 'ranked' ? 'active' : ''}`} onClick={() => setH2hType('ranked')}>
                  {t('participantProfile.stats.ranked')}
                </button>
                <button className={`h2h-type-tab ${h2hType === 'league' ? 'active' : ''}`} onClick={() => setH2hType('league')}>
                  {t('participantProfile.stats.league')}
                </button>
              </div>
            </div>
            {currentMatchups.length > 0 ? (
              <div className="h2h-list">
                {currentMatchups.map((m) => {
                  const myCh = getCharacter(m.gameId, m.characterId);
                  const oppCh = getCharacter(m.gameId, m.opponentCharacterId);
                  return (
                    <div key={`${m.gameId}:${m.characterId}:${m.opponentCharacterId}`} className="h2h-row h2h-matchup">
                      <div className="h2h-info">
                        <img
                          src={getCharacterImageUrl(m.gameId, m.characterId) ?? undefined}
                          alt={myCh?.name || m.characterId}
                          className="h2h-char-icon"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className="h2h-name">{myCh?.name || m.characterId}</span>
                        <span className="h2h-vs">vs</span>
                        <img
                          src={getCharacterImageUrl(m.gameId, m.opponentCharacterId) ?? undefined}
                          alt={oppCh?.name || m.opponentCharacterId}
                          className="h2h-char-icon"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className="h2h-name">{oppCh?.name || m.opponentCharacterId}</span>
                        <GameBadge gameId={m.gameId} />
                      </div>
                      <div className="h2h-record">
                        <span>{m.wins} - {m.losses}</span>
                        <span className="h2h-wr">{m.winRate}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="stat-empty">{t('participantProfile.stats.noData')}</div>
            )}
          </>
        )}
      </div>

      {/* Monthly activity */}
      <div className="stats-section card activity-section">
        <div className="stats-section-header">
          <h3>{t('participantProfile.stats.monthlyActivity')}</h3>
          <div className="h2h-type-tabs">
            <button className={`h2h-type-tab ${activityType === 'all' ? 'active' : ''}`} onClick={() => setActivityType('all')}>
              {t('participantProfile.stats.all')}
            </button>
            <button className={`h2h-type-tab ${activityType === 'tournament' ? 'active' : ''}`} onClick={() => setActivityType('tournament')}>
              {t('participantProfile.stats.tournament')}
            </button>
            <button className={`h2h-type-tab ${activityType === 'ranked' ? 'active' : ''}`} onClick={() => setActivityType('ranked')}>
              {t('participantProfile.stats.ranked')}
            </button>
            <button className={`h2h-type-tab ${activityType === 'league' ? 'active' : ''}`} onClick={() => setActivityType('league')}>
              {t('participantProfile.stats.league')}
            </button>
          </div>
        </div>
        {stats.monthlyActivity.length > 0 ? (
          <div className="activity-chart">
            {(() => {
              const months: { month: string; matches: number; tournaments: number; byType?: typeof stats.monthlyActivity[0]['byType'] }[] = [];
              const now = new Date();
              for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const existing = stats.monthlyActivity.find((x) => x.month === mk);
                months.push(existing ?? { month: mk, matches: 0, tournaments: 0, byType: { tournament: { matches: 0 }, ranked: { matches: 0 }, league: { matches: 0 } } });
              }
              const maxCount = Math.max(...months.map((x) => activityType === 'all' ? x.matches : (x.byType?.[activityType as keyof typeof x.byType]?.matches ?? 0)));
              const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              return months.map((m) => {
                const count = activityType === 'all' ? m.matches : (m.byType?.[activityType as keyof typeof m.byType]?.matches ?? 0);
                const height = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                const isCurrent = m.month === currentMonth;
                return (
                  <div key={m.month} className={`activity-bar-wrapper ${isCurrent ? 'current' : ''}`}>
                    <div className="activity-bar-container">
                      <div className="activity-bar" style={{ height: `${height}%` }}>
                        <span className="activity-bar-value">{count}</span>
                      </div>
                    </div>
                    <span className="activity-month">
                      {new Date(m.month + '-01').toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="stat-empty">{t('participantProfile.stats.noData')}</div>
        )}
        <div className="activity-legend">
          <span>Matches</span>
        </div>
      </div>
    </div>
  );
}

export default ParticipantStatsOverview;
