import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ParticipantStatsSummary } from '@/services/participants/participantService';
import { GlobalParticipant } from '@/models/types';
import { getCharacter, getGame, GAMES } from '@/data/games';
import { getCharacterThumbUrl } from '@/utils/characterImage';
import { gameBadgeStyle, gameAccent } from '@/utils/gameColor';
import { getRankIcon, getRankColor, RANK_TIERS } from '@/utils/rank';
import SectionTabs from '@/components/SectionTabs';
import './ParticipantStatsOverview.css';

interface ParticipantStatsOverviewProps {
  stats: ParticipantStatsSummary | null;
  participant: GlobalParticipant | null;
  gameFilter?: string;
}

type H2HTab = 'players' | 'characters';
type MatchType = 'all' | 'tournament' | 'ranked' | 'league';

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

function StatCard({ label, right, children, className = '', style }: { label?: string; right?: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`stat-card ${className}`} style={style}>
      {label || right ? (
        <div className="stat-card-header">
          {label && <div className="stat-card-label">{label}</div>}
          {right}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function GameBadge({ gameId, inverted }: { gameId: string; inverted?: boolean }) {
  const game = getGame(gameId);
  const accent = gameAccent(gameId);
  const style = inverted && accent
    ? { background: '#ffffff', color: accent, borderColor: 'transparent' }
    : gameBadgeStyle(gameId);
  return (
    <span className="game-badge" style={style}>
      {game?.id?.toUpperCase() || gameId}
    </span>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function CharacterRow({ gameId, characterId, label, winRate, count, sets, totalPicks, totalMatches, isMain }: {
  gameId: string;
  characterId: string;
  label?: string;
  winRate: number;
  count: number;
  /** Sets where the char was used; usage% = sets / totalMatches */
  sets?: number;
  totalPicks: number;
  totalMatches: number;
  isMain?: boolean;
}) {
  const ch = getCharacter(gameId, characterId);
  const usagePercent = totalMatches > 0 && sets != null ? Math.round((sets / totalMatches) * 100) : 0;
  const barPercent = totalPicks > 0 ? Math.round((count / totalPicks) * 100) : 0;
  const displayName = ch?.name || label || characterId;

  return (
    <div className={`character-row ${isMain ? 'main' : ''}`}>
      <img
        src={getCharacterThumbUrl(gameId, characterId) ?? undefined}
        alt={displayName}
        className="character-row-icon"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="character-row-info">
        <div className="character-row-top">
          <span className="character-row-name">{displayName}</span>
          <span className="character-row-stats">
            <span className="character-row-stat usage"><span>{usagePercent}%</span> <small>usage</small></span>
            <span className="character-row-stat games">{count} games</span>
            <span className="character-row-stat wr">{winRate}% winrate</span>
          </span>
        </div>
        <div className="character-row-bar">
          <div className="character-row-fill" style={{ width: `${barPercent}%` }} />
        </div>
      </div>
    </div>
  );
}

function H2HRow({ name, sub, wins, losses, winRate, image, eloRank, eloPoints }: { name: string; sub?: string; wins: number; losses: number; winRate: number; image?: string; eloRank?: string | null; eloPoints?: number | null }) {
  return (
    <div className="h2h-row">
      <div className="h2h-info">
        {eloRank !== undefined && (
          <span className="h2h-rank" style={{ color: getRankColor(eloRank ?? 'Sin puntos') }}>
            <i className={getRankIcon(eloRank ?? 'Sin puntos')} />
            <span className="h2h-rank-pts">{eloPoints != null ? eloPoints.toLocaleString() : '—'}</span>
          </span>
        )}
        {image && (
          <img
            src={image}
            alt={name}
            className="h2h-char-icon"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
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



function ParticipantStatsOverview({ stats, participant, gameFilter }: ParticipantStatsOverviewProps) {
  const { t } = useTranslation();
  const [h2hTab, setH2hTab] = useState<H2HTab>('players');
  const [h2hPlayerFilter, setH2hPlayerFilter] = useState<string>('');
  const [charTimeRange, setCharTimeRange] = useState<'allTime' | 'last6Months'>('allTime');
  const [summaryMatchType, setSummaryMatchType] = useState<MatchType>('all');

  const summaryRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [summaryStuck, setSummaryStuck] = useState(false);
  const [summaryHeight, setSummaryHeight] = useState(0);

  useLayoutEffect(() => {
    const update = () => {
      setSummaryHeight(summaryRef.current?.offsetHeight ?? 0);
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro && summaryRef.current) ro.observe(summaryRef.current);
    window.addEventListener('resize', update);
    return () => {
      if (ro && summaryRef.current) ro.unobserve(summaryRef.current);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const s = sentinelRef.current;
      if (!s) return;
      setSummaryStuck(s.getBoundingClientRect().top <= 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Global game selector ────────────────────────────────────────────────────

  // Build the list of games this participant actually has data for
  const availableGames = useMemo(() => {
    if (!stats) return GAMES;
    const ids = new Set<string>();
    stats.peakEloByGame.forEach((e) => ids.add(e.gameId));
    stats.recordByGame?.forEach((r) => ids.add(r.gameId));
    stats.characterUsage.forEach((c) => ids.add(c.gameId));
    if (ids.size === 0) GAMES.forEach((g) => ids.add(g.id));
    return GAMES.filter((g) => ids.has(g.id));
  }, [stats]);

  const primaryGameId = useMemo(() => {
    if (!participant || !stats) return availableGames[0]?.id ?? GAMES[0]?.id ?? '';
    // Use participant's declared primary game if it's in availableGames
    const declared = (participant as GlobalParticipant & { primaryGameId?: string; gameId?: string }).primaryGameId
      || (participant as GlobalParticipant & { primaryGameId?: string; gameId?: string }).gameId
      || '';
    if (declared && availableGames.some((g) => g.id === declared)) return declared;
    // Otherwise fall back to the game with the highest ELO
    return stats.peakEloByGame[0]?.gameId || availableGames[0]?.id || GAMES[0]?.id || '';
  }, [participant, stats, availableGames]);

  const effectiveGame = gameFilter || primaryGameId;

  if (!stats || !participant) return null;

  // ── Derived data filtered by effectiveGame ──────────────────────────────────
  const gameElo = stats.peakEloByGame.find((e) => e.gameId === effectiveGame) ?? stats.peakEloByGame[0] ?? null;

  // Progress within current tier toward next rank
  const eloTier = gameElo ? RANK_TIERS.find((t) => t.name === gameElo.rank) : null;
  const nextTier = gameElo ? RANK_TIERS.find((t) => t.minPoints > (eloTier?.minPoints ?? 0)) : null;
  const eloProgress = gameElo && eloTier && eloTier.maxPoints != null
    ? Math.round(((gameElo.points - eloTier.minPoints) / (eloTier.maxPoints - eloTier.minPoints + 1)) * 100)
    : gameElo ? 100 : 0;
  const gameRecord = stats.recordByGame?.find((g) => g.gameId === effectiveGame) ?? null;

  const charSource = useMemo(() => {
    let base;
    if (summaryMatchType === 'all') {
      base = charTimeRange === 'last6Months' ? stats.characterUsageLast6Months : stats.characterUsage;
    } else {
      base = charTimeRange === 'last6Months'
        ? stats.characterUsageLast6MonthsByType[summaryMatchType]
        : stats.characterUsageByType[summaryMatchType];
    }
    return base.filter((c) => c.gameId === effectiveGame);
  }, [charTimeRange, summaryMatchType, stats, effectiveGame]);

  const selectedUsageTotal = charSource.reduce((sum, c) => sum + c.count, 0);
  const gameTotalMatches = useMemo(() => {
    const rec = charTimeRange === 'last6Months'
      ? (stats.recordByGameLast6Months ?? []).find((g) => g.gameId === effectiveGame)
      : gameRecord;
    if (!rec) return 0;
    if (summaryMatchType === 'all') return rec.wins + rec.losses;
    return rec.byType?.[summaryMatchType]
      ? rec.byType[summaryMatchType].wins + rec.byType[summaryMatchType].losses
      : 0;
  }, [gameRecord, stats.recordByGameLast6Months, effectiveGame, charTimeRange, summaryMatchType]);
  const hasCharacterData = charSource.length > 0;

  const gameMains = stats.mainCharactersByGame[effectiveGame] ?? null;
  const gamePlacements = stats.topPlacementsByGame?.[effectiveGame] ?? { top1: 0, top3: 0, top8: 0, top16: 0 };
  const gameHighlights = useMemo(
    () => stats.tournamentHighlights.filter((h) => h.gameId === effectiveGame),
    [stats.tournamentHighlights, effectiveGame]
  );

  const summaryRecords = useMemo(() => {
    const pick = (rec: typeof gameRecord | null) => {
      if (!rec) return { wins: 0, losses: 0, winRate: 0 };
      if (summaryMatchType === 'all') return { wins: rec.wins, losses: rec.losses, winRate: rec.winRate };
      const bt = rec.byType?.[summaryMatchType];
      const wins = bt?.wins ?? 0;
      const losses = bt?.losses ?? 0;
      return { wins, losses, winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0 };
    };
    const rec6 = (stats.recordByGameLast6Months ?? []).find((g) => g.gameId === effectiveGame) ?? null;
    return {
      allTime: { label: t('participantProfile.stats.total'), ...pick(gameRecord) },
      last6Months: { label: t('participantProfile.stats.last6Months'), ...pick(rec6) },
    };
  }, [summaryMatchType, gameRecord, stats.recordByGameLast6Months, effectiveGame, t]);

  const currentH2HPlayers = useMemo(() => {
    const byGame = stats.headToHeadByGame?.[effectiveGame] ?? [];
    let list = byGame
      .map((h) => {
        if (summaryMatchType === 'all') return h;
        const bt = h.byType?.[summaryMatchType] ?? { wins: 0, losses: 0 };
        return {
          ...h,
          wins: bt.wins,
          losses: bt.losses,
          winRate: bt.wins + bt.losses > 0 ? Math.round((bt.wins / (bt.wins + bt.losses)) * 100) : 0,
        };
      })
      .filter((h) => h.wins + h.losses > 0)
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
    if (h2hPlayerFilter) {
      list = list.filter((h) => h.id === h2hPlayerFilter);
    }
    return list;
  }, [stats.headToHeadByGame, effectiveGame, summaryMatchType, h2hPlayerFilter]);

  const opponentCharacterH2H = useMemo(() => {
    const map = new Map<string, { gameId: string; characterId: string; wins: number; losses: number }>();
    for (const m of stats.matchupWinRates.filter((m) => m.gameId === effectiveGame)) {
      const rec = summaryMatchType === 'all' ? m : { wins: m.byType[summaryMatchType].wins, losses: m.byType[summaryMatchType].losses };
      if (rec.wins + rec.losses === 0) continue;
      const existing = map.get(m.opponentCharacterId) || { gameId: m.gameId, characterId: m.opponentCharacterId, wins: 0, losses: 0 };
      existing.wins += rec.wins;
      existing.losses += rec.losses;
      map.set(m.opponentCharacterId, existing);
    }
    return Array.from(map.values())
      .map((x) => ({ ...x, winRate: x.wins + x.losses > 0 ? Math.round((x.wins / (x.wins + x.losses)) * 100) : 0 }))
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  }, [stats.matchupWinRates, effectiveGame, summaryMatchType]);

  return (
    <div className="participant-stats-overview">

      {/* Performance */}
      <div className="stats-overview-grid">
        <StatCard
          label={t('participantProfile.stats.peakElo')}
          className="peak-elo-card"
          style={{ '--rank-color': gameElo?.color ?? '#94a3b8' } as React.CSSProperties}
        >
          {gameElo ? (
            <div className="peak-elo-content">
              <div className="peak-elo-icon" style={{ color: gameElo.color }}>
                <i className={getRankIcon(gameElo.rank)} />
              </div>
              <div className="peak-elo-info">
                <div className="peak-elo-main">
                  <span className="peak-elo-rank" style={{ color: gameElo.color }}>{gameElo.rank}</span>
                  <span className="peak-elo-points">{gameElo.points} pts</span>
                </div>
                {nextTier && (
                  <div className="peak-elo-progress">
                    <div className="peak-elo-progress-track">
                      <div
                        className="peak-elo-progress-fill"
                        style={{ width: `${eloProgress}%`, background: gameElo.color }}
                      />
                    </div>
                    <span className="peak-elo-progress-label">
                      {nextTier.name} → {(nextTier.minPoints - gameElo.points)} pts
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <span className="stat-empty">{t('participantProfile.stats.noData')}</span>
          )}
        </StatCard>

        <StatCard label={t('participantProfile.stats.placements')} className="placements-card">
          <div className="placements-list">
            <div className="placement-pill gold">
              <span className="placement-medal">🥇</span>
              <span className="placement-count">{gamePlacements.top1}</span>
              <small>1st</small>
            </div>
            <div className="placement-pill silver">
              <span className="placement-medal">🥉</span>
              <span className="placement-count">{gamePlacements.top3}</span>
              <small>Top 3</small>
            </div>
            <div className="placement-pill">
              <span className="placement-count">{gamePlacements.top8}</span>
              <small>Top 8</small>
            </div>
            <div className="placement-pill">
              <span className="placement-count">{gamePlacements.top16}</span>
              <small>Top 16</small>
            </div>
          </div>
        </StatCard>
      </div>

      {/* Highlights */}
      {gameHighlights.length > 0 && (
        <div className="stats-section card highlights-section">
          <div className="stats-section-header">
            <h3>{t('participantProfile.stats.highlights', 'Highlights')}</h3>
            <span className="highlights-subtitle">{t('participantProfile.stats.allTime', 'All Time')}</span>
          </div>
          <div className="highlights-grid">
            {gameHighlights.map((h, i) => {
              const prev = gameHighlights[i + 1];
              const diff = prev ? prev.placement - h.placement : 0;
              const improved = diff > 0;
              return (
                <div key={h.tournamentId} className="highlight-card" style={{ '--game-accent': gameAccent(h.gameId) ?? '#7c3aed' } as React.CSSProperties}>
                  <div className="highlight-game">
                    <GameBadge gameId={h.gameId} inverted />
                  </div>
                  <div className="highlight-main">
                    <div className="highlight-placement">
                      {ordinal(h.placement)}
                      <span className="highlight-entrants">/{h.entrants}</span>
                    </div>
                    <span className="highlight-name">{h.name}</span>
                    <span className="highlight-date">
                      {new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                    </span>
                  </div>
                  {diff !== 0 && (
                    <span className={`highlight-trend ${improved ? 'up' : 'down'}`}>
                      {improved ? '▲' : '▼'} {Math.abs(diff)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary header with global match type filter */}
      <div ref={sentinelRef} className="summary-sentinel" aria-hidden="true" />
      <div ref={summaryRef} className={`summary-section card ${summaryStuck ? 'is-stuck' : ''}`}>
        <div className="summary-section-header">
          <h2 className="summary-section-title">{t('participantProfile.stats.summary', 'Summary')}</h2>
          <SectionTabs
            options={[
              { value: 'all', label: t('participantProfile.stats.all') },
              { value: 'tournament', label: t('participantProfile.stats.tournament') },
              { value: 'ranked', label: t('participantProfile.stats.ranked') },
              { value: 'league', label: t('participantProfile.stats.league') },
            ]}
            value={summaryMatchType}
            onChange={(v) => setSummaryMatchType(v as MatchType)}
          />
        </div>
      </div>
      <div ref={placeholderRef} className="summary-placeholder" style={{ height: summaryStuck ? summaryHeight : 0 }} />

      <div className="stats-overview-grid">
        <StatCard label={t('participantProfile.stats.matchRecord')} className="record-card record-card--full">
          <div className="record-bars">
            <RecordBar
              label={t('participantProfile.stats.allTime', 'All Time')}
              wins={summaryRecords.allTime.wins}
              losses={summaryRecords.allTime.losses}
              winRate={summaryRecords.allTime.winRate}
            />
            <RecordBar
              label={t('participantProfile.stats.last6Months', 'Last 6 Months')}
              wins={summaryRecords.last6Months.wins}
              losses={summaryRecords.last6Months.losses}
              winRate={summaryRecords.last6Months.winRate}
            />
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
              {gameMains ? (
                <div className="main-char-row">
                  <img
                    src={getCharacterThumbUrl(effectiveGame, gameMains.id) ?? undefined}
                    alt={getCharacter(effectiveGame, gameMains.id)?.name || gameMains.id}
                    className="main-char-row-icon"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="main-char-row-name">{getCharacter(effectiveGame, gameMains.id)?.name || gameMains.id}</span>
                  <GameBadge gameId={effectiveGame} />
                </div>
              ) : (
                <span className="stat-empty">{t('participantProfile.stats.noData')}</span>
              )}
            </div>
          </div>

          <div className="usage-card">
            <div className="usage-header">
              <div className="mains-label">{t('participantProfile.stats.characterUsage')}</div>
              <SectionTabs
                options={[
                  { value: 'allTime', label: t('participantProfile.stats.allTime', 'All Time') },
                  { value: 'last6Months', label: t('participantProfile.stats.last6Months', 'Last 6 Months') },
                ]}
                value={charTimeRange}
                onChange={(v) => setCharTimeRange(v as 'allTime' | 'last6Months')}
              />
            </div>
            {hasCharacterData ? (
              <div className="character-usage-game">
                {charSource.length > 0 ? (
                  <div className="character-usage-list">
                    {charSource.map((c) => (
                      <CharacterRow
                        key={`${c.gameId}:${c.characterId}`}
                        gameId={c.gameId}
                        characterId={c.characterId}
                        winRate={c.winRate}
                        count={c.count}
                        sets={c.sets}
                        totalPicks={selectedUsageTotal}
                        totalMatches={gameTotalMatches}
                        isMain={c.characterId === gameMains?.id}
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
          <SectionTabs
            options={[
              { value: 'players', label: t('participantProfile.stats.players') },
              { value: 'characters', label: t('participantProfile.stats.characters') },
            ]}
            value={h2hTab}
            onChange={(v) => setH2hTab(v as H2HTab)}
          />
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
                  {currentH2HPlayers.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
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
                    eloRank={h.eloRank ?? null}
                    eloPoints={h.eloPoints ?? null}
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
            {opponentCharacterH2H.length > 0 ? (
              <div className="h2h-list">
                {opponentCharacterH2H.map((c) => {
                  const ch = getCharacter(c.gameId, c.characterId);
                  return (
                    <H2HRow
                      key={c.characterId}
                      name={ch?.name || c.characterId}
                      wins={c.wins}
                      losses={c.losses}
                      winRate={c.winRate}
                      image={getCharacterThumbUrl(c.gameId, c.characterId) ?? undefined}
                    />
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
        </div>
        {stats.monthlyActivity.length > 0 ? (
          <div className="activity-chart">
            {(() => {
              const months: typeof stats.monthlyActivity = [];
              const now = new Date();
              for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const existing = stats.monthlyActivity.find((x) => x.month === mk);
                months.push(existing ?? { month: mk, matches: 0, tournaments: 0, byType: { tournament: { matches: 0 }, ranked: { matches: 0 }, league: { matches: 0 } } });
              }
              const monthCount = (x: typeof months[0]) =>
                summaryMatchType === 'all'
                  ? (x.byGame?.[effectiveGame]?.matches ?? 0)
                  : (x.byGame?.[effectiveGame]?.byType?.[summaryMatchType as 'tournament' | 'ranked' | 'league']?.matches ?? 0);
              const maxCount = Math.max(...months.map(monthCount));
              const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
              return months.map((m) => {
                const count = monthCount(m);
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
