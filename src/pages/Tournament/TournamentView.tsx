import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useCommunity } from '@/contexts/CommunityContext';
import { Tournament } from '@/models/types';
import { getTournament, setMatchWinner, undoMatchResult } from '@/services/tournament/tournamentService';

import Sidebar from '@/components/Sidebar/Sidebar';
import BracketView from '@/components/Bracket/BracketView';
import ParticipantsList from '@/components/Participants/ParticipantsList';
import Top8Podium from '@/components/Top8Podium/Top8Podium';
import './TournamentView.css';

type ViewMode = 'bracket' | 'participants';

function TournamentView() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getPath, canAdminCurrentCommunity } = useCommunity();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('bracket');
  const [error, setError] = useState('');

  useEffect(() => {
    loadTournament();
  }, [id]);

  const loadTournament = () => {
    if (!id) return;
    
    const loadedTournament = getTournament(id);
    if (!loadedTournament) {
      setError(t('tournament.view.notFoundTitle'));
      return;
    }
    
    setTournament(loadedTournament);
  };

  const handleMatchResult = async (matchId: string, winnerId: string) => {
    if (!id) return;

    try {
      const updatedTournament = await setMatchWinner(id, matchId, winnerId);
      setTournament(updatedTournament);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRevertMatch = async (matchId: string) => {
    if (!id) return;

    try {
      const updatedTournament = await undoMatchResult(id, matchId);
      setTournament(updatedTournament);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleBackToDashboard = () => {
    navigate(getPath('events'));
  };

  if (!tournament) {
    return (
      <div className="tournament-view">
        <div className="container">
          <div className="error-state card">
            <h2>{t('tournament.view.notFoundTitle')}</h2>
            <p className="text-secondary">{error || t('tournament.view.notFoundDesc')}</p>
            <button className="btn-primary mt-2" onClick={handleBackToDashboard}>
              {t('tournament.view.backToDashboard')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sidebarItems = [
    {
      id: 'bracket',
      label: t('tournament.view.sidebarBracket'),
      active: viewMode === 'bracket',
      onClick: () => setViewMode('bracket'),
      disabled: tournament.status === 'setup',
    },
    {
      id: 'participants',
      label: t('tournament.view.sidebarParticipants'),
      count: tournament.participants.length,
      active: viewMode === 'participants',
      onClick: () => setViewMode('participants'),
    },
  ];

  return (
    <div className="tournament-view">
      <Sidebar items={sidebarItems} />
      
      <div className="tournament-content">
        <div className="tournament-header">
          <div>
            <h1>{tournament.name}</h1>
            <div className="tournament-meta">
              <span className="meta-item">
                {t('tournament.view.participantCount', { count: tournament.participants.length })}
              </span>
              <span className="meta-separator">•</span>
              <span className="meta-item">
                {t(tournament.mode === 'double_elimination' ? 'tournament.view.modeDouble' : 'tournament.view.modeSingle')}
              </span>
              {tournament.championId && (
                <>
                  <span className="meta-separator">•</span>
                  <span className="meta-item champion">
                    <i className="fas fa-trophy" /> {t('tournament.view.champion', { name: tournament.participants.find(p => p.id === tournament.championId)?.name })}
                  </span>
                </>
              )}
            </div>
          </div>
          <button className="btn-outline" onClick={handleBackToDashboard}>
            {t('tournament.view.backToDashboard')}
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {tournament.status === 'completed' && (
          <Top8Podium
            participants={tournament.participants}
            tournamentName={tournament.name}
            gameId={tournament.gameId ?? undefined}
          />
        )}

        {tournament.status === 'setup' ? (
          <div className="setup-notice card">
            <h3>{t('tournament.view.setupTitle')}</h3>
            <p className="text-secondary">
              {t('tournament.view.setupDesc')}
            </p>
            <button className="btn-primary mt-2" onClick={handleBackToDashboard}>
              {t('tournament.view.backToDashboard')}
            </button>
          </div>
        ) : (
          <>
            {viewMode === 'bracket' && tournament.bracket && (
              <BracketView
                bracket={tournament.bracket}
                participants={tournament.participants}
                onMatchResult={canAdminCurrentCommunity ? handleMatchResult : undefined}
                onRevertMatch={canAdminCurrentCommunity && tournament.status !== 'completed' ? handleRevertMatch : undefined}
                readOnly={tournament.status === 'completed' || !canAdminCurrentCommunity}
              />
            )}

            {viewMode === 'participants' && (
              <div className="participants-view">
                <h2>{t('tournament.view.participantsTitle')}</h2>
                <ParticipantsList
                  participants={tournament.participants}
                  onRemove={() => {}}
                  onUpdate={() => {}}
                  readOnly={true}
                  tournamentMode={true}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TournamentView;
