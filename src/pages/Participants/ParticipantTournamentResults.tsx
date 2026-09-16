import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getGame, getCharacter } from '@/data/games';
import { gameBadgeStyle, gameAccent } from '@/utils/gameColor';
import { getCharacterIconUrl } from '@/utils/characterImage';
import type { TournamentResult, TournamentResultMatch } from '@/services/participants/participantService';
import './ParticipantTournamentResults.css';

type SortField = 'date' | 'placement';
type SortDir = 'desc' | 'asc';

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function GameBadge({ gameId }: { gameId: string }) {
  const game = getGame(gameId);
  const accent = gameAccent(gameId);
  const style = accent
    ? { background: accent, color: '#fff', border: 'none' }
    : gameBadgeStyle(gameId);
  return (
    <span className="tr-game-badge" style={style as React.CSSProperties}>
      {game?.id?.toUpperCase() || gameId?.toUpperCase()}
    </span>
  );
}

interface Props {
  results: TournamentResult[];
  onNavigate: (tournamentId: string) => void;
}

function CharIcon({ gameId, characterId }: { gameId: string; characterId: string }) {
  const url = getCharacterIconUrl(gameId, characterId);
  const ch = getCharacter(gameId, characterId);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={ch?.name ?? characterId}
      className="tr-char-icon"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function CharIcons({ gameId, characterIds }: { gameId: string; characterIds: string[] }) {
  if (!characterIds || characterIds.length === 0) return null;
  return (
    <div className={`tr-char-icons ${characterIds.length > 1 ? 'tr-char-icons--multi' : ''}`}>
      {characterIds.map((id) => (
        <CharIcon key={id} gameId={gameId} characterId={id} />
      ))}
    </div>
  );
}

function MatchRow({ m, gameId }: { m: TournamentResultMatch; gameId: string }) {
  const hasScore = m.playerScore !== null && m.opponentScore !== null;
  const win = m.result === 'win';
  return (
    <div className={`tr-match tr-match--${m.result}`}>
      {/* Round label */}
      <span className="tr-match-label">{m.label}</span>

      {/* Player icon */}
      <CharIcons gameId={gameId} characterIds={m.playerCharacterIds} />

      {/* Player name, left of the score (seed already in tournament header) */}
      <span className="tr-match-player">
        <span className="tr-match-player-name">{m.playerName}</span>
      </span>

      {/* Score block or W/L badge */}
      {hasScore ? (
        <div className="tr-score-block">
          <span className={`tr-score-box ${win ? 'score--win' : 'score--neutral'}`}>
            {m.playerScore}
          </span>
          <span className={`tr-score-box ${!win ? 'score--loss' : 'score--neutral'}`}>
            {m.opponentScore}
          </span>
        </div>
      ) : (
        <span className={`tr-match-result ${win ? 'result--win' : 'result--loss'}`}>
          {win ? 'W' : 'L'}
        </span>
      )}

      {/* Opponent name/seed, right of the score */}
      <span className="tr-match-opponent">
        <span className="tr-match-opp-name">{m.opponentName}</span>
        {m.opponentSeed !== null && <span className="tr-match-opp-seed">&nbsp;#{m.opponentSeed}</span>}
      </span>

      {/* Opponent icon (far right) */}
      <CharIcons gameId={gameId} characterIds={m.opponentCharacterIds} />
    </div>
  );
}

export default function ParticipantTournamentResults({ results, onNavigate }: Props) {
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const sorted = [...results].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') {
      cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else {
      const pa = a.placement ?? 9999;
      const pb = b.placement ?? 9999;
      cmp = pa - pb;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const placementClass = (pl: number | null) => {
    if (!pl) return '';
    if (pl === 1) return 'placement--gold';
    if (pl <= 3) return 'placement--podium';
    if (pl <= 8) return 'placement--top8';
    return '';
  };

  return (
    <div className="tr-container">
      {/* Header row */}
      <div className="tr-header">
        <span className="tr-count">
          {results.length} {t('participantProfile.results.events', 'Events')}
        </span>
        <div className="tr-sort">
          <span className="tr-sort-label">{t('participantProfile.results.sortBy', 'Sort by')}</span>
          <select
            className="tr-sort-select"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
          >
            <option value="date">{t('participantProfile.results.sortDate', 'Date')}</option>
            <option value="placement">{t('participantProfile.results.sortPlacement', 'Placement')}</option>
          </select>
          <select
            className="tr-sort-select"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as SortDir)}
          >
            <option value="desc">{t('participantProfile.results.sortDesc', 'Desc')}</option>
            <option value="asc">{t('participantProfile.results.sortAsc', 'Asc')}</option>
          </select>
        </div>
      </div>

      {/* Tournament rows */}
      {sorted.length === 0 ? (
        <div className="tr-empty">{t('participantProfile.results.noTournamentResults', 'No tournament results yet.')}</div>
      ) : (
        <div className="tr-list">
          {sorted.map((r) => {
            const expanded = expandedIds.has(r.tournamentId);
            const accent = gameAccent(r.gameId);
            return (
              <div key={r.tournamentId} className={`tr-event ${expanded ? 'tr-event--open' : ''}`}>
                {/* Tournament header */}
                <div
                  className="tr-event-header"
                  style={{ '--tr-accent': accent ?? 'var(--primary-color)' } as React.CSSProperties}
                  onClick={() => toggle(r.tournamentId)}
                >
                  {/* Left: game badge */}
                  <div className="tr-event-badge">
                    <GameBadge gameId={r.gameId} />
                  </div>

                  {/* Center: name + meta */}
                  <div className="tr-event-info">
                    <button
                      className="tr-event-name"
                      onClick={(e) => { e.stopPropagation(); onNavigate(r.tournamentId); }}
                    >
                      {r.name}
                    </button>
                    <span className="tr-event-meta">
                      {getGame(r.gameId)?.name || r.gameId}
                      {r.date && (
                        <> &middot; {new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}</>
                      )}
                    </span>
                  </div>

                  {/* Right: seed + placement */}
                  <div className="tr-event-right">
                    {r.seed && <span className="tr-seed">#{r.seed}</span>}
                    {r.placement ? (
                      <span className={`tr-placement ${placementClass(r.placement)}`}>
                        <strong>{ordinal(r.placement)}</strong>
                        <span className="tr-entrants">/{r.totalParticipants}</span>
                      </span>
                    ) : (
                      <span className="tr-placement">—</span>
                    )}
                    <span className={`tr-chevron ${expanded ? 'tr-chevron--up' : ''}`}>
                      <i className="fas fa-chevron-down" />
                    </span>
                  </div>
                </div>

                {/* Match rows */}
                {expanded && r.matches.length > 0 && (
                  <div className="tr-matches">
                    {r.matches.map((m) => (
                      <MatchRow key={m.matchId} m={m} gameId={r.gameId} />
                    ))}
                  </div>
                )}
                {expanded && r.matches.length === 0 && (
                  <div className="tr-matches tr-matches--empty">
                    <span className="tr-empty-small">{t('participantProfile.results.noMatchDetail', 'No match detail available.')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
