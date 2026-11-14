import { useTranslation } from 'react-i18next';
import { LeagueResultEntry } from '@/models/types';
import { useMemo, useRef } from 'react';
import Pagination from '@/components/Pagination/Pagination';
import { useLocalPagination } from '@/hooks/usePaginatedList';
import './ParticipantLeagueResults.css';

interface Props {
  results: LeagueResultEntry[];
  onNavigate: (leagueId: string) => void;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const ORDERED = { sort: [{ field: 'order', dir: 'asc' as const, type: 'number' as const }] };

export default function ParticipantLeagueResults({ results, onNavigate }: Props) {
  const { t } = useTranslation();
  // Paginated in the order the profile gives (most relevant first); ids are the league ids.
  const listTopRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => results.map((r, i) => ({ ...r, id: r.leagueId, order: i })), [results]);
  const list = useLocalPagination(rows, ORDERED, { listId: 'profile-league-results' });

  if (results.length === 0) {
    return <div className="lr-empty">{t('participantProfile.results.noLeagueResults', 'No league results yet.')}</div>;
  }

  return (
    <div>
    <div ref={listTopRef} />
    <div className="lr-list">
      {list.items.map((r) => (
        <div
          key={r.leagueId}
          className="lr-card"
          onClick={() => onNavigate(r.leagueId)}
        >
          <div className="lr-header">
            <div className="lr-main">
              <span className="lr-name">{r.leagueName}</span>
              <span className="lr-meta">
                {new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
              </span>
            </div>
            <div className={`lr-rank ${r.rank <= 3 ? 'podium' : ''}`}>
              <span className="lr-rank-pos">{ordinal(r.rank)}</span>
              <span className="lr-rank-total">/{r.totalParticipants}</span>
            </div>
          </div>

          <div className="lr-body">
            <div className="lr-record-bar" title={`${r.wins}W - ${r.losses}L`}>
              <div
                className="lr-record-wins"
                style={{ width: `${r.matchesPlayed > 0 ? (r.wins / r.matchesPlayed) * 100 : 0}%` }}
              />
            </div>

            <div className="lr-stats">
              <span className="lr-record-text">
                {r.wins}W - {r.losses}L
              </span>
              <span className="lr-wr">{r.winRate}% WR</span>
              <span className={`lr-elo ${r.eloChange >= 0 ? 'positive' : 'negative'}`}>
                {r.eloChange >= 0 ? '+' : ''}{r.eloChange} ELO
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
    <Pagination {...list.paginationProps} scrollRef={listTopRef} />
    </div>
  );
}
