import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGame, getCharacter } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import { gameBadgeStyle } from '@/utils/gameColor';
import PlayerDisplay from '@/components/PlayerDisplay/PlayerDisplay';
import type { HeadToHeadEntry, H2HMatchType, H2HTimeFilter } from '@/services/participants/participantService';
import './ParticipantH2H.css';

type H2HSubTab = 'participants' | 'characters';

interface Props {
  entries: HeadToHeadEntry[];
  matchType: H2HMatchType;
  onMatchTypeChange: (type: H2HMatchType) => void;
  timeFilter: H2HTimeFilter;
  onTimeFilterChange: (months: H2HTimeFilter) => void;
  loading: boolean;
  onNavigateParticipant: (id: string) => void;
}

function CharIcons({ gameId, characterIds }: { gameId: string; characterIds: string[] }) {
  if (!characterIds || characterIds.length === 0) return null;
  return (
    <div className={`h2h-icons ${characterIds.length > 1 ? 'h2h-icons--multi' : ''}`}>
      {characterIds.map((cid) => {
        const ch = getCharacter(gameId, cid);
        const url = getCharacterImageUrl(gameId, cid);
        if (!url) return null;
        return (
          <img
            key={cid}
            src={url}
            alt={ch?.name ?? cid}
            className="h2h-icon-img"
            title={ch?.name ?? cid}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        );
      })}
    </div>
  );
}

function WinRateCircle({ winRate, record }: { winRate: number; record: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const filled = (winRate / 100) * c;
  const color = winRate >= 50 ? '#10b981' : '#ef4444';
  return (
    <div className="h2h-circle">
      <svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} className="h2h-circle-bg" />
        <circle
          cx="48" cy="48" r={r}
          className="h2h-circle-fill"
          stroke={color}
          strokeDasharray={`${filled} ${c - filled}`}
        />
      </svg>
      <div className="h2h-circle-text">
        <span className="h2h-circle-pct">{winRate}%</span>
        <span className="h2h-circle-sub">{record}</span>
      </div>
    </div>
  );
}

function OpponentCard({ entry, onNavigate }: { entry: HeadToHeadEntry; onNavigate: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const record = `${entry.setsWon}-${entry.setsLost}`;
  const isWinning = entry.setWinRate >= 50;
  const gamesWithDataPct = entry.totalSets > 0
    ? Math.round((entry.setsWithGameData / entry.totalSets) * 100) : 0;

  return (
    <div className={`h2h-opp-card ${isWinning ? 'h2h-opp-card--win' : 'h2h-opp-card--loss'}`}>

      <button className="h2h-opp-header" onClick={() => setExpanded((v) => !v)}>
        <div className="h2h-opp-title">
          <span className={`h2h-opp-rec ${isWinning ? 'pos' : 'neg'}`}>{record}</span>
          <span className="h2h-opp-vs">vs</span>
          <span className="h2h-opp-name"><PlayerDisplay name={entry.opponentName} alias={entry.opponentAlias} /></span>
        </div>
        <i className={`fas fa-chevron-down h2h-opp-chevron ${expanded ? 'up' : ''}`} />
      </button>

      <div className="h2h-opp-body">
        <div className="h2h-circle-col">
          <WinRateCircle winRate={entry.setWinRate} record={record} />
        </div>

        <div className="h2h-stats-table">
          <div className="h2h-st-row">
            <span className="h2h-st-label">Games</span>
            <span className="h2h-st-values">
              <span className="h2h-st-val">{entry.gamesWon}-{entry.gamesLost}</span>
              <span className={`h2h-st-pct ${entry.gamesWon + entry.gamesLost > 0 ? (entry.gameWinRate >= 50 ? 'pos' : 'neg') : ''}`}>
                {entry.gamesWon + entry.gamesLost > 0 ? `${entry.gameWinRate}%` : 'N/A'}
              </span>
            </span>
          </div>
          <div className="h2h-st-row">
            <span className="h2h-st-label">Sets in Losers</span>
            <span className="h2h-st-values">
              <span className="h2h-st-val">{entry.losersWon}-{entry.losersLost}</span>
              <span className="h2h-st-pct">
                {entry.losersWon + entry.losersLost > 0
                  ? `${Math.round((entry.losersWon / (entry.losersWon + entry.losersLost)) * 100)}%`
                  : 'N/A'}
              </span>
            </span>
          </div>
          <div className="h2h-st-row">
            <span className="h2h-st-label">Last 5</span>
            <span className="h2h-st-values">
              {entry.lastFive.length === 0
                ? <span className="h2h-st-pct">N/A</span>
                : (
                  <span className="h2h-last5">
                    {entry.lastFive.map((r, i) => (
                      <span key={i} className={`h2h-l5 ${r === 'W' ? 'w' : 'l'}`} />
                    ))}
                  </span>
                )}
            </span>
          </div>
          <div className="h2h-st-row">
            <span className="h2h-st-label">
              {entry.streakType === 'win' ? 'Win Streak' : 'Loss Streak'}
            </span>
            <span className="h2h-st-values">
              <span className={`h2h-st-val ${entry.streakType === 'win' ? 'pos' : 'neg'}`}>
                {entry.streakCount || '—'}
              </span>
            </span>
          </div>
          <div className="h2h-st-row">
            <span className="h2h-st-note">
              * {entry.setsWithGameData} Set ({gamesWithDataPct}%) has reported game data
            </span>
          </div>
        </div>
      </div>

      {expanded && (() => {
        // Aggregate character matchups for this specific opponent
        const muMap = new Map<string, { gameId: string; myChar: string; oppChar: string; wins: number; losses: number }>();
        for (const s of entry.sets) {
          const gId = s.gameId ?? 'ssbu';
          for (const g of s.games) {
            if (!g.myChar || !g.oppChar) continue;
            const key = `${gId}:${g.myChar}:${g.oppChar}`;
            const cur = muMap.get(key) ?? { gameId: gId, myChar: g.myChar, oppChar: g.oppChar, wins: 0, losses: 0 };
            if (g.won) cur.wins++; else cur.losses++;
            muMap.set(key, cur);
          }
        }
        const matchups = [...muMap.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

        if (matchups.length === 0) {
          return (
            <div className="h2h-sets">
              <div className="h2h-sets-empty">No character data available.</div>
            </div>
          );
        }
        return (
          <div className="h2h-mu-table h2h-opp-mu-table">
            {matchups.map((m) => {
              const my = getCharacter(m.gameId, m.myChar);
              const opp = getCharacter(m.gameId, m.oppChar);
              const total = m.wins + m.losses;
              const wr = total > 0 ? Math.round((m.wins / total) * 100) : 0;
              return (
                <div key={`${m.gameId}:${m.myChar}:${m.oppChar}`} className="h2h-mu-row">
                  <CharIcons gameId={m.gameId} characterIds={[m.myChar]} />
                  <span className="h2h-mu-char-name">{my?.name ?? m.myChar}</span>
                  <span className="h2h-mu-vs">vs</span>
                  <CharIcons gameId={m.gameId} characterIds={[m.oppChar]} />
                  <span className="h2h-mu-char-name">{opp?.name ?? m.oppChar}</span>
                  <span className="h2h-mu-rec">{m.wins}-{m.losses}</span>
                  <span className={`h2h-mu-wr ${wr >= 50 ? 'pos' : 'neg'}`}>
                    {total > 0 ? `${wr}%` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      <button
        className="h2h-opp-go"
        title="View profile"
        onClick={(e) => { e.stopPropagation(); onNavigate(entry.opponentId); }}
      >
        <i className="fas fa-arrow-right" />
      </button>
    </div>
  );
}

interface CharMatchup {
  gameId: string;
  myChar: string;
  oppChar: string;
  wins: number;
  losses: number;
}

export default function ParticipantH2H({
  entries,
  matchType,
  onMatchTypeChange,
  timeFilter,
  onTimeFilterChange,
  loading,
  onNavigateParticipant,
}: Props) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<H2HSubTab>('participants');
  const [myCharFilter, setMyCharFilter] = useState<string>('');
  const [oppCharFilter, setOppCharFilter] = useState<string>('');

  // Reset character filters when game changes (entries array reference changes)
  useEffect(() => {
    setMyCharFilter('');
    setOppCharFilter('');
  }, [entries]);

  // Aggregate character matchups from game-level data (myChar vs oppChar per game)
  const charMatchups = useMemo<CharMatchup[]>(() => {
    const map = new Map<string, CharMatchup>();
    for (const entry of entries) {
      for (const s of entry.sets) {
        const gId = s.gameId ?? 'ssbu';
        for (const g of s.games) {
          const myC = g.myChar;
          const oppC = g.oppChar;
          if (!myC || !oppC) continue;
          const key = `${gId}:${myC}:${oppC}`;
          const cur = map.get(key) ?? { gameId: gId, myChar: myC, oppChar: oppC, wins: 0, losses: 0 };
          if (g.won) cur.wins++; else cur.losses++;
          map.set(key, cur);
        }
      }
    }
    return [...map.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
  }, [entries]);

  if (loading) {
    return <div className="h2h-panel"><div className="h2h-empty">Loading...</div></div>;
  }

  return (
    <div className="h2h-panel">
      <div className="h2h-controls">
        <div className="h2h-controls-row h2h-controls-row--top">
          <h3>{t('participantProfile.h2h.title', 'Head to Head')}</h3>

          <div className="h2h-filter-block h2h-filter-block--match-type">
            <span className="h2h-filter-label">{t('participantProfile.h2h.matchType', 'Match type')}</span>
            <div className="h2h-event-tabs">
              {(['all', 'tournament', 'league', 'duel'] as H2HMatchType[]).map((mt) => (
                <button
                  key={mt}
                  className={`h2h-event-tab ${matchType === mt ? 'active' : ''}`}
                  onClick={() => onMatchTypeChange(mt)}
                >
                  {mt === 'all' && t('participantProfile.h2h.type.all', 'All')}
                  {mt === 'tournament' && t('participantProfile.h2h.type.tournament', 'Tournaments')}
                  {mt === 'league' && t('participantProfile.h2h.type.league', 'League')}
                  {mt === 'duel' && t('participantProfile.h2h.type.duel', 'Duels')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h2h-controls-row">
          <div className="h2h-filter-block h2h-filter-block--view">
            <div className="h2h-subtabs">
              {(['participants', 'characters'] as H2HSubTab[]).map((st) => (
                <button
                  key={st}
                  className={`h2h-subtab ${subTab === st ? 'active' : ''}`}
                  onClick={() => setSubTab(st)}
                >
                  {st === 'participants'
                    ? t('participantProfile.h2h.participants', 'Participants')
                    : t('participantProfile.h2h.characters', 'Characters')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {subTab === 'participants' && (
        entries.length === 0
          ? <div className="h2h-empty">{t('participantProfile.h2h.noOpponents', 'No opponents yet.')}</div>
          : (
            <div className="h2h-opp-list">
              {entries.map((e) => (
                <OpponentCard key={e.opponentId} entry={e} onNavigate={onNavigateParticipant} />
              ))}
            </div>
          )
      )}

      {subTab === 'characters' && (() => {
        if (charMatchups.length === 0)
          return <div className="h2h-empty">{t('participantProfile.h2h.noMatchups', 'No character matchups yet.')}</div>;

        // Unique options for filters
        const myCharOpts = [...new Map(charMatchups.map((m) => [`${m.gameId}:${m.myChar}`, m])).values()];
        const oppCharOpts = [...new Map(charMatchups.map((m) => [`${m.gameId}:${m.oppChar}`, m])).values()];

        const filtered = charMatchups.filter((m) =>
          (!myCharFilter || m.myChar === myCharFilter) &&
          (!oppCharFilter || m.oppChar === oppCharFilter)
        );

        // Group by gameId:myChar
        const groupMap = new Map<string, CharMatchup[]>();
        for (const m of filtered) {
          const key = `${m.gameId}:${m.myChar}`;
          if (!groupMap.has(key)) groupMap.set(key, []);
          groupMap.get(key)!.push(m);
        }
        const groups = [...groupMap.entries()].sort((a, b) => {
          const aTotal = a[1].reduce((s, m) => s + m.wins + m.losses, 0);
          const bTotal = b[1].reduce((s, m) => s + m.wins + m.losses, 0);
          return bTotal - aTotal;
        });

        return (
          <div className="h2h-mu-table">
            {/* ── Filters ── */}
            <div className="h2h-mu-filters">
              <div className="h2h-mu-filter-group">
                <label className="h2h-mu-filter-label">{t('participantProfile.h2h.myChar', 'My char')}</label>
                <select
                  className="h2h-mu-filter-select"
                  value={myCharFilter}
                  onChange={(e) => setMyCharFilter(e.target.value)}
                >
                  <option value="">{t('common.all', 'All')}</option>
                  {myCharOpts.map((m) => (
                    <option key={`${m.gameId}:${m.myChar}`} value={m.myChar}>
                      {getCharacter(m.gameId, m.myChar)?.name ?? m.myChar}
                    </option>
                  ))}
                </select>
              </div>
              <span className="h2h-mu-filter-vs">vs</span>
              <div className="h2h-mu-filter-group">
                <label className="h2h-mu-filter-label">{t('participantProfile.h2h.oppChar', 'Opp char')}</label>
                <select
                  className="h2h-mu-filter-select"
                  value={oppCharFilter}
                  onChange={(e) => setOppCharFilter(e.target.value)}
                >
                  <option value="">{t('common.all', 'All')}</option>
                  {oppCharOpts.map((m) => (
                    <option key={`${m.gameId}:${m.oppChar}`} value={m.oppChar}>
                      {getCharacter(m.gameId, m.oppChar)?.name ?? m.oppChar}
                    </option>
                  ))}
                </select>
              </div>

              <div className="h2h-mu-filter-block h2h-mu-filter-block--time">
                <div className="h2h-time-tabs">
                  {(['all', '6'] as H2HTimeFilter[]).map((m) => (
                    <button
                      key={m}
                      className={`h2h-time-tab ${timeFilter === m ? 'active' : ''}`}
                      onClick={() => onTimeFilterChange(m)}
                    >
                      {m === 'all' ? t('participantProfile.h2h.timeAll', 'All') : t('participantProfile.h2h.time6m', '6 months')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Grouped rows ── */}
            {filtered.length === 0
              ? <div className="h2h-empty">{t('participantProfile.h2h.noMatchupsFilter', 'No matchups for this filter.')}</div>
              : groups.map(([groupKey, matchups]) => {
                const first = matchups[0];
                const myChar = getCharacter(first.gameId, first.myChar);
                const badge = gameBadgeStyle(first.gameId);
                const groupWins = matchups.reduce((s, m) => s + m.wins, 0);
                const groupLosses = matchups.reduce((s, m) => s + m.losses, 0);
                const sorted = [...matchups].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
                return (
                  <div key={groupKey} className="h2h-mu-group">
                    <div className="h2h-mu-group-header">
                      <span className="h2h-mu-game" style={badge}>{getGame(first.gameId)?.shortName ?? first.gameId}</span>
                      <CharIcons gameId={first.gameId} characterIds={[first.myChar]} />
                      <span className="h2h-mu-group-name">{myChar?.name ?? first.myChar}</span>
                      <span className="h2h-mu-group-rec">{groupWins}-{groupLosses}</span>
                    </div>
                    {sorted.map((m) => {
                      const opp = getCharacter(m.gameId, m.oppChar);
                      const total = m.wins + m.losses;
                      const wr = total > 0 ? Math.round((m.wins / total) * 100) : 0;
                      return (
                        <div key={`${m.gameId}:${m.myChar}:${m.oppChar}`} className="h2h-mu-row">
                          <span className="h2h-mu-vs">vs</span>
                          <CharIcons gameId={m.gameId} characterIds={[m.oppChar]} />
                          <span className="h2h-mu-char-name">{opp?.name ?? m.oppChar}</span>
                          <span className="h2h-mu-rec">{m.wins}-{m.losses}</span>
                          <span className={`h2h-mu-wr ${wr >= 50 ? 'pos' : 'neg'}`}>
                            {total > 0 ? `${wr}%` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            }
          </div>
        );
      })()}
    </div>
  );
}
