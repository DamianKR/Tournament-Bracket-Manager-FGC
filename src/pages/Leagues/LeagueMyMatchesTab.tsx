import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { League, LeagueMatch, LeagueStanding, GlobalParticipant } from '@/models/types';
import ParticipantName from '@/components/ParticipantName/ParticipantName';
import ReportMatchModal from './ReportMatchModal';
import './LeagueMyMatchesTab.css';

interface LeagueMyMatchesTabProps {
  league: League;
  matches: LeagueMatch[];
  standings: LeagueStanding[];
  participants: Map<string, GlobalParticipant>;
  onMatchUpdated: () => void;
}

function LeagueMyMatchesTab({ league, matches, standings, participants, onMatchUpdated }: LeagueMyMatchesTabProps) {
  const { t } = useTranslation();
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [selectedMatch, setSelectedMatch] = useState<LeagueMatch | null>(null);

  function getParticipantName(id: string): string {
    const p = participants.get(id);
    return p ? (p.alias?.trim() || p.name) : t('tournament.bracket.unknown');
  }

  function getSelectParticipantName(id: string): string {
    const p = participants.get(id);
    return p ? (p.alias ? `${p.alias} (${p.name})` : p.name) : t('tournament.bracket.unknown');
  }

  const myMatches = useMemo(() => {
    if (!selectedParticipantId) return [];
    return matches.filter(
      m => m.participant1Id === selectedParticipantId || m.participant2Id === selectedParticipantId
    );
  }, [matches, selectedParticipantId]);

  const myStanding = standings.find(s => s.participantId === selectedParticipantId);

  // Calculate actual current week from startDate
  const start = new Date(league.startDate);
  const now = new Date();
  const diffDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const effectiveCurrentWeek = diffDays < 0 ? 0 : Math.floor(diffDays / league.periodDays) + 1;

  const thisWeekMatches = myMatches.filter(m => m.week === effectiveCurrentWeek);
  const upcomingMatches = myMatches.filter(m => m.status === 'scheduled' && m.week > effectiveCurrentWeek);
  const completedMatches = myMatches.filter(m => m.status === 'completed' || m.status === 'no_show');
  const remainingOpponents = league.participantIds.filter(pid => {
    if (pid === selectedParticipantId) return false;
    return !myMatches.some(m => 
      (m.participant1Id === pid || m.participant2Id === pid) && 
      (m.status === 'completed' || m.status === 'no_show')
    );
  });

  function renderMatch(match: LeagueMatch) {
    const isCompleted = match.status === 'completed' || match.status === 'no_show';
    const isNoShow = match.status === 'no_show';
    const opponentId = match.participant1Id === selectedParticipantId ? match.participant2Id : match.participant1Id;
    const didWin = match.winnerId === selectedParticipantId;
    const myEloChange = match.participant1Id === selectedParticipantId ? match.participant1EloChange : match.participant2EloChange;

    return (
      <div key={match.id} className={`my-match-row ${isCompleted ? 'completed' : 'pending'}`}>
        <div className="my-match-opponent">
          <span className="my-match-vs">{t('league.schedule.vs')}</span>
          <ParticipantName id={opponentId} name={getParticipantName(opponentId)} className="opponent-name" />
        </div>

        {isCompleted ? (
          <>
            <div className={`my-match-result ${didWin ? 'win' : 'loss'}`}>
              {isNoShow ? (
                match.noShowParticipantId === selectedParticipantId ? t('league.myMatches.noShow') : t('league.myMatches.walkover')
              ) : (
                didWin ? t('league.myMatches.win', { score: match.score }) : t('league.myMatches.loss', { score: match.score })
              )}
            </div>
            {myEloChange !== undefined && (
              <div className={`my-match-elo ${myEloChange >= 0 ? 'elo-positive' : 'elo-negative'}`}>
                {myEloChange >= 0 ? '+' : ''}{myEloChange} {t('league.myMatches.elo')}
              </div>
            )}
            {match.completedDate && (
              <div className="my-match-date">
                {new Date(match.completedDate).toLocaleDateString()}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="my-match-status">{t('league.myMatches.pending')}</div>
            {match.week <= effectiveCurrentWeek && (!match.scheduledDate || new Date(match.scheduledDate) <= new Date()) ? (
              <button
                className="btn-primary btn-sm"
                onClick={() => setSelectedMatch(match)}
              >
                {t('league.myMatches.reportResult')}
              </button>
            ) : (
              <span className="match-locked" title={t('league.myMatches.lockedUntil', { week: match.week })}>
                <i className="fas fa-lock" /> {match.week <= effectiveCurrentWeek ? t('league.myMatches.startsSoon') : t('league.myMatches.weekNumber', { week: match.week })}
              </span>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="my-matches-tab">
      <div className="my-matches-selector card">
        <label>
          {t('league.myMatches.selectPlayer')}
          <select
            value={selectedParticipantId}
            onChange={(e) => setSelectedParticipantId(e.target.value)}
          >
            <option value="">{t('league.myMatches.choosePlayer')}</option>
            {league.participantIds
              .map((pid) => ({ id: pid, name: getSelectParticipantName(pid) }))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
          </select>
        </label>
      </div>

      {selectedParticipantId && myStanding && (
        <>
          <div className="my-stats-card card">
            <h3>{t('league.myMatches.statsTitle')}</h3>
            <div className="my-stats-grid">
              <div className="my-stat">
                <span className="my-stat-label">{t('league.myMatches.rank')}</span>
                <span className="my-stat-value">#{myStanding.rank}</span>
              </div>
              <div className="my-stat">
                <span className="my-stat-label">{t('league.myMatches.record')}</span>
                <span className="my-stat-value">{myStanding.wins}{t('common.w')}-{myStanding.losses}{t('common.l')}</span>
              </div>
              <div className="my-stat">
                <span className="my-stat-label">{t('league.myMatches.elo')}</span>
                <span className="my-stat-value">{myStanding.currentElo}</span>
              </div>
              <div className="my-stat">
                <span className="my-stat-label">{t('league.myMatches.change')}</span>
                <span className={`my-stat-value ${myStanding.eloChange >= 0 ? 'text-success' : 'text-danger'}`}>
                  {myStanding.eloChange >= 0 ? '+' : ''}{myStanding.eloChange}
                </span>
              </div>
            </div>
          </div>

          {thisWeekMatches.length > 0 && (
            <div className="my-matches-section card">
              <h3>{t('league.myMatches.thisWeek', { week: league.currentWeek })}</h3>
              <div className="my-matches-list">
                {thisWeekMatches.map(renderMatch)}
              </div>
            </div>
          )}

          {upcomingMatches.length > 0 && (
            <div className="my-matches-section card">
              <h3>{t('league.myMatches.upcoming')}</h3>
              <div className="my-matches-list">
                {upcomingMatches.slice(0, 5).map(renderMatch)}
              </div>
            </div>
          )}

          {completedMatches.length > 0 && (
            <div className="my-matches-section card">
              <h3>{t('league.myMatches.completed', { count: completedMatches.length })}</h3>
              <div className="my-matches-list">
                {completedMatches.slice(0, 10).map(renderMatch)}
              </div>
            </div>
          )}

          {remainingOpponents.length > 0 && (
            <div className="my-matches-section card">
              <h3>{t('league.myMatches.remainingOpponents', { count: remainingOpponents.length })}</h3>
              <div className="remaining-opponents">
                {remainingOpponents.map((pid) => (
                  <span key={pid} className="opponent-chip">
                    <ParticipantName id={pid} name={getParticipantName(pid)} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!selectedParticipantId && (
        <div className="empty-state card">
          <p className="text-secondary">{t('league.myMatches.noPlayerSelected')}</p>
        </div>
      )}

      {selectedMatch && (
        <ReportMatchModal
          league={league}
          match={selectedMatch}
          participants={participants}
          onClose={() => setSelectedMatch(null)}
          onSuccess={() => {
            setSelectedMatch(null);
            onMatchUpdated();
          }}
        />
      )}
    </div>
  );
}

export default LeagueMyMatchesTab;
