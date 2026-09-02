import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCommunity } from '@/contexts/CommunityContext';
import { League, LeagueMatch, LeagueStanding } from '@/models/league';
import { GlobalParticipant } from '@/models/types';
import {
  getLeague,
  getLeagueMatches,
  getLeagueStandings,
} from '@/services/leagues/leagueService';
import { getAllParticipantsAsync } from '@/services/participants/participantService';

import LeagueStandingsTab from './LeagueStandingsTab';
import LeagueScheduleTab from './LeagueScheduleTab';
import LeagueMyMatchesTab from './LeagueMyMatchesTab';
import LeaguePendingTab from './LeaguePendingTab';
import LeagueOptionsTab from './LeagueOptionsTab';
import LeagueInfoTab from './LeagueInfoTab';
import Loading from '@/components/Loading/Loading';
import './LeagueView.css';

type Tab = 'info' | 'standings' | 'schedule' | 'my-matches' | 'pending' | 'options';

function LeagueView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentCommunity, getPath, canAdminCurrentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;

  const [league, setLeague] = useState<League | null>(null);
  const [matches, setMatches] = useState<LeagueMatch[]>([]);
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [participants, setParticipants] = useState<Map<string, GlobalParticipant>>(new Map());
  const [tab, setTab] = useState<Tab>('standings');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  async function loadData() {
    if (!id || !communityId) return;
    setLoading(true);

    const [leagueData, matchesData, standingsData, participantsData] = await Promise.all([
      getLeague(id),
      getLeagueMatches(id),
      getLeagueStandings(id),
      getAllParticipantsAsync(communityId),
    ]);

    if (!leagueData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setLeague(leagueData);
    setMatches(matchesData);
    setStandings(standingsData);
    setParticipants(new Map(participantsData.map(p => [p.id, p])));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [id, communityId]);

  if (loading) {
    return (
      <div className="league-view-page">
        <div className="container">
          <Loading message="Loading league..." />
        </div>
      </div>
    );
  }

  if (notFound || !league) {
    return (
      <div className="league-view-page">
        <div className="container">
          <div className="empty-state card">
            <h3>League not found</h3>
            <button className="btn-outline mt-2" onClick={() => navigate(getPath('events?tab=leagues'))}>
              ← Back to leagues
            </button>
          </div>
        </div>
      </div>
    );
  }

  const completedMatches = matches.filter(m => m.status === 'completed' || m.status === 'no_show').length;
  const totalMatches = matches.length;
  const progressPercent = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

  return (
    <div className="league-view-page">
      {/* Header */}
      <div className="league-header">
        <div className="container">
          <button className="league-back-btn" onClick={() => navigate(getPath('events?tab=leagues'))}>
            ← Leagues
          </button>
          <div className="league-header-content">
            <h1 className="league-title"><i className="fas fa-trophy" /> {league.name}</h1>
            <div className="league-meta">
              <span>Week {league.currentWeek}</span>
              <span>•</span>
              <span>{completedMatches}/{totalMatches} matches completed</span>
              <span>•</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="league-progress-bar">
              <div className="league-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="league-tabs-bar">
        <div className="container league-tabs">
          <button
            className={`league-tab ${tab === 'standings' ? 'active' : ''}`}
            onClick={() => setTab('standings')}
          >
            Standings
          </button>
          <button
            className={`league-tab ${tab === 'schedule' ? 'active' : ''}`}
            onClick={() => setTab('schedule')}
          >
            Schedule
          </button>
          <button
            className={`league-tab ${tab === 'my-matches' ? 'active' : ''}`}
            onClick={() => setTab('my-matches')}
          >
            Matches
          </button>
          {canAdminCurrentCommunity && (
            <button
              className={`league-tab ${tab === 'pending' ? 'active' : ''}`}
              onClick={() => setTab('pending')}
            >
              <i className="fas fa-exclamation-triangle" /> Pending Review
            </button>
          )}
          <button
            className={`league-tab ${tab === 'options' ? 'active' : ''}`}
            onClick={() => setTab('options')}
          >
            Options
          </button>
          <button
            className={`league-tab ${tab === 'info' ? 'active' : ''}`}
            onClick={() => setTab('info')}
          >
            <i className="fas fa-info-circle" /> Info
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container league-content">
        {tab === 'info' && <LeagueInfoTab league={league} />}
        {tab === 'standings' && (
          <LeagueStandingsTab
            leagueId={league.id}
            standings={standings}
            participants={participants}
            playoffsEnabled={league.playoffsEnabled}
            onRefresh={loadData}
          />
        )}
        {tab === 'schedule' && (
          <LeagueScheduleTab
            league={league}
            matches={matches}
            participants={participants}
            onMatchUpdated={loadData}
          />
        )}
        {tab === 'my-matches' && (
          <LeagueMyMatchesTab
            league={league}
            matches={matches}
            standings={standings}
            participants={participants}
            onMatchUpdated={loadData}
          />
        )}
        {tab === 'pending' && canAdminCurrentCommunity && (
          <LeaguePendingTab
            league={league}
            matches={matches}
            participants={participants}
            onMatchUpdated={loadData}
          />
        )}
        {tab === 'options' && <LeagueOptionsTab league={league} />}
      </div>
    </div>
  );
}

export default LeagueView;
