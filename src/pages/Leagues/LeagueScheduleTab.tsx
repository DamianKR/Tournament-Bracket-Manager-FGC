import { useState } from 'react';
import { League, LeagueMatch, GlobalParticipant } from '@/models/types';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { formatInTimeZone } from '@/utils/timeZone';
import ParticipantName from '@/components/ParticipantName/ParticipantName';
import ReportMatchModal from './ReportMatchModal';
import './LeagueScheduleTab.css';

interface LeagueScheduleTabProps {
  league: League;
  matches: LeagueMatch[];
  participants: Map<string, GlobalParticipant>;
  onMatchUpdated: () => void;
}

function LeagueScheduleTab({ league, matches, participants, onMatchUpdated }: LeagueScheduleTabProps) {
  const { user } = useAuth();
  const { isInMyCommunity, canAdminCurrentCommunity } = useCommunity();
  const [selectedMatch, setSelectedMatch] = useState<LeagueMatch | null>(null);
  const [weekFilter, setWeekFilter] = useState<number | 'all'>('all');

  function getParticipantName(id: string): string {
    const p = participants.get(id);
    return p ? (p.alias?.trim() || p.name) : 'Unknown';
  }

  function formatDate(dateStr: string | undefined): string {
    return formatInTimeZone(dateStr, league.timeZone || 'America/Havana');
  }

  // Calculate the actual current week based on startDate and today
  function getEffectiveCurrentWeek(): number {
    const start = new Date(league.startDate);
    const now = new Date();
    const diffDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 0; // League hasn't started yet
    return Math.floor(diffDays / league.periodDays) + 1;
  }

  const effectiveCurrentWeek = getEffectiveCurrentWeek();

  // Group matches by week
  const matchesByWeek = new Map<number, LeagueMatch[]>();
  for (const match of matches) {
    if (!matchesByWeek.has(match.week)) {
      matchesByWeek.set(match.week, []);
    }
    matchesByWeek.get(match.week)!.push(match);
  }

  const weeks = Array.from(matchesByWeek.keys()).sort((a, b) => a - b);
  const filteredWeeks = weekFilter === 'all' ? weeks : weeks.filter(w => w === weekFilter);

  return (
    <div className="schedule-tab">
      <div className="schedule-controls">
        <label>
          Week:
          <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All Weeks</option>
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}{w > effectiveCurrentWeek ? ' (future)' : w === effectiveCurrentWeek ? ' (current)' : ' (past)'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredWeeks.map((week) => {
        const weekMatches = matchesByWeek.get(week) || [];
        const completed = weekMatches.filter(m => m.status === 'completed' || m.status === 'no_show').length;

        return (
          <div key={week} className="week-section card">
            <div className="week-header">
              <h3>Week {week}</h3>
              <span className="week-timezone" title="All dates shown in this time zone">
                {league.timeZone || 'America/Havana'}
              </span>
              <span className="week-progress">
                {completed}/{weekMatches.length} completed
              </span>
            </div>

            <div className="matches-list">
              {weekMatches.map((match) => {
                const isCompleted = match.status === 'completed' || match.status === 'no_show';
                const isNoShow = match.status === 'no_show';
                const winner = match.winnerId;
                const isFutureWeek = match.week > effectiveCurrentWeek;
                const matchStarted = !match.scheduledDate || new Date(match.scheduledDate) <= new Date();

                return (
                  <div key={match.id} className={`match-row ${isCompleted ? 'completed' : isFutureWeek ? 'pending future' : 'pending'}`}>
                    <div className="match-status-icon">
                      {isCompleted ? <i className="fas fa-check" /> : <i className="fas fa-clock" />}
                    </div>

                    <div className="match-players">
                      <div className={`match-player ${winner === match.participant1Id ? 'winner' : ''}`}>
                        <ParticipantName id={match.participant1Id} name={getParticipantName(match.participant1Id)} className="match-player-name" />
                        {isNoShow && match.noShowParticipantId === match.participant1Id && (
                          <span className="no-show-tag">No-show</span>
                        )}
                      </div>
                      <span className="match-vs">vs</span>
                      <div className={`match-player ${winner === match.participant2Id ? 'winner' : ''}`}>
                        <ParticipantName id={match.participant2Id} name={getParticipantName(match.participant2Id)} className="match-player-name" />
                        {isNoShow && match.noShowParticipantId === match.participant2Id && (
                          <span className="no-show-tag">No-show</span>
                        )}
                      </div>
                    </div>

                    {isCompleted && match.score && (
                      <div className="match-score">{match.score}</div>
                    )}

                    {isCompleted && (match.participant1EloChange || match.participant2EloChange) && (
                      <div className="match-elo-changes">
                        <span className={match.participant1EloChange! >= 0 ? 'elo-positive' : 'elo-negative'}>
                          {match.participant1EloChange! >= 0 ? '+' : ''}{match.participant1EloChange}
                        </span>
                        <span className={match.participant2EloChange! >= 0 ? 'elo-positive' : 'elo-negative'}>
                          {match.participant2EloChange! >= 0 ? '+' : ''}{match.participant2EloChange}
                        </span>
                      </div>
                    )}

                    {!isCompleted && isFutureWeek && (
                      <span className="match-locked" title={`Locked until Week ${match.week}`}>
                        <i className="fas fa-lock" /> Week {match.week}
                      </span>
                    )}

                    {!isCompleted && !isFutureWeek && matchStarted && isInMyCommunity && (canAdminCurrentCommunity ||
                      (user?.participantId && (match.participant1Id === user.participantId || match.participant2Id === user.participantId))) && (
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => setSelectedMatch(match)}
                      >
                        Report Result
                      </button>
                    )}

                    {!isCompleted && !isFutureWeek && !matchStarted && (
                      <span className="match-locked" title={formatDate(match.scheduledDate)}>
                        <i className="fas fa-lock" /> Starts {formatDate(match.scheduledDate)}
                      </span>
                    )}

                    {(isCompleted || matchStarted) && match.scheduledDate && (
                      <div className="match-date">{formatDate(match.scheduledDate)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filteredWeeks.length === 0 && (
        <div className="empty-state card">
          <p className="text-secondary">No matches found.</p>
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

export default LeagueScheduleTab;
