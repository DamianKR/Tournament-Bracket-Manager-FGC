import { useTranslation } from 'react-i18next';
import { LeagueResultEntry } from '@/models/types';
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

export default function ParticipantLeagueResults({ results, onNavigate }: Props) {
  const { t } = useTranslation();

  if (results.length === 0) {
    return <div className="lr-empty">{t('participantProfile.results.noLeagueResults', 'No league results yet.')}</div>;
  }

  return (
    <div className="lr-list">
      {results.map((r) => (
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
  );
}
