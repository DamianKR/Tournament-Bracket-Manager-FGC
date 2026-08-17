import { useState, useMemo } from 'react';
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
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [selectedMatch, setSelectedMatch] = useState<LeagueMatch | null>(null);

  function getParticipantName(id: string): string {
    const p = participants.get(id);
    return p ? (p.alias?.trim() || p.name) : 'Unknown';
  }

  const myMatches = useMemo(() => {
    if (!selectedParticipantId) return [];
    return matches.filter(
      m => m.participant1Id === selectedParticipantId || m.participant2Id === selectedParticipantId
    );
  }, [matches, selectedParticipantId]);

  const myStanding = standings.find(s => s.participantId === selectedParticipantId);

  const thisWeekMatches = myMatches.filter(m => m.week === league.currentWeek);
  const upcomingMatches = myMatches.filter(m => m.status === 'scheduled' && m.week > league.currentWeek);
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
          <span className="my-match-vs">vs</span>
          <ParticipantName id={opponentId} name={getParticipantName(opponentId)} className="opponent-name" />
        </div>

        {isCompleted ? (
          <>
            <div className={`my-match-result ${didWin ? 'win' : 'loss'}`}>
              {isNoShow ? (
                match.noShowParticipantId === selectedParticipantId ? 'No-show' : 'W (walkover)'
              ) : (
                didWin ? `W ${match.score}` : `L ${match.score}`
              )}
            </div>
            {myEloChange !== undefined && (
              <div className={`my-match-elo ${myEloChange >= 0 ? 'elo-positive' : 'elo-negative'}`}>
                {myEloChange >= 0 ? '+' : ''}{myEloChange} ELO
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
            <div className="my-match-status">Pending</div>
            <button
              className="btn-primary btn-sm"
              onClick={() => setSelectedMatch(match)}
            >
              Report Result
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="my-matches-tab">
      <div className="my-matches-selector card">
        <label>
          Select Player:
          <select
            value={selectedParticipantId}
            onChange={(e) => setSelectedParticipantId(e.target.value)}
          >
            <option value="">-- Choose a player --</option>
            {league.participantIds.map((pid) => (
              <option key={pid} value={pid}>
                {getParticipantName(pid)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedParticipantId && myStanding && (
        <>
          <div className="my-stats-card card">
            <h3>My Stats</h3>
            <div className="my-stats-grid">
              <div className="my-stat">
                <span className="my-stat-label">Rank</span>
                <span className="my-stat-value">#{myStanding.rank}</span>
              </div>
              <div className="my-stat">
                <span className="my-stat-label">Record</span>
                <span className="my-stat-value">{myStanding.wins}W-{myStanding.losses}L</span>
              </div>
              <div className="my-stat">
                <span className="my-stat-label">ELO</span>
                <span className="my-stat-value">{myStanding.currentElo}</span>
              </div>
              <div className="my-stat">
                <span className="my-stat-label">Change</span>
                <span className={`my-stat-value ${myStanding.eloChange >= 0 ? 'text-success' : 'text-danger'}`}>
                  {myStanding.eloChange >= 0 ? '+' : ''}{myStanding.eloChange}
                </span>
              </div>
            </div>
          </div>

          {thisWeekMatches.length > 0 && (
            <div className="my-matches-section card">
              <h3>This Week (Week {league.currentWeek})</h3>
              <div className="my-matches-list">
                {thisWeekMatches.map(renderMatch)}
              </div>
            </div>
          )}

          {upcomingMatches.length > 0 && (
            <div className="my-matches-section card">
              <h3>Upcoming</h3>
              <div className="my-matches-list">
                {upcomingMatches.slice(0, 5).map(renderMatch)}
              </div>
            </div>
          )}

          {completedMatches.length > 0 && (
            <div className="my-matches-section card">
              <h3>Completed ({completedMatches.length})</h3>
              <div className="my-matches-list">
                {completedMatches.slice(0, 10).map(renderMatch)}
              </div>
            </div>
          )}

          {remainingOpponents.length > 0 && (
            <div className="my-matches-section card">
              <h3>Remaining Opponents ({remainingOpponents.length})</h3>
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
          <p className="text-secondary">Select a player to view their matches.</p>
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
