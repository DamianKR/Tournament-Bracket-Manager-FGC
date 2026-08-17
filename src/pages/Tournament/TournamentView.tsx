import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tournament } from '@/models/types';
import { getTournament, setMatchWinner, undoMatchResult } from '@/services/tournament/tournamentService';
import Sidebar from '@/components/Sidebar/Sidebar';
import BracketView from '@/components/Bracket/BracketView';
import ParticipantsList from '@/components/Participants/ParticipantsList';
import Top8Podium from '@/components/Top8Podium/Top8Podium';
import './TournamentView.css';

type ViewMode = 'bracket' | 'participants';

function TournamentView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      setError('Tournament not found');
      return;
    }
    
    setTournament(loadedTournament);
  };

  const handleMatchResult = (matchId: string, winnerId: string) => {
    if (!id) return;

    try {
      const updatedTournament = setMatchWinner(id, matchId, winnerId);
      setTournament(updatedTournament);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRevertMatch = (matchId: string) => {
    if (!id) return;

    try {
      const updatedTournament = undoMatchResult(id, matchId);
      setTournament(updatedTournament);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleBackToDashboard = () => {
    navigate('/');
  };

  if (!tournament) {
    return (
      <div className="tournament-view">
        <div className="container">
          <div className="error-state card">
            <h2>Tournament Not Found</h2>
            <p className="text-secondary">{error || 'The tournament you are looking for does not exist.'}</p>
            <button className="btn-primary mt-2" onClick={handleBackToDashboard}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sidebarItems = [
    {
      id: 'bracket',
      label: 'Bracket',
      active: viewMode === 'bracket',
      onClick: () => setViewMode('bracket'),
      disabled: tournament.status === 'setup',
    },
    {
      id: 'participants',
      label: 'Participants',
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
                {tournament.participants.length} Participants
              </span>
              <span className="meta-separator">•</span>
              <span className="meta-item">
                {tournament.mode === 'double_elimination' ? 'Double Elimination' : 'Single Elimination'}
              </span>
              {tournament.championId && (
                <>
                  <span className="meta-separator">•</span>
                  <span className="meta-item champion">
                    <i className="fas fa-trophy" /> Champion: {tournament.participants.find(p => p.id === tournament.championId)?.name}
                  </span>
                </>
              )}
            </div>
          </div>
          <button className="btn-outline" onClick={handleBackToDashboard}>
            Back to Dashboard
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
            <h3>Tournament Not Started</h3>
            <p className="text-secondary">
              This tournament has not been started yet. Please complete the setup first.
            </p>
            <button className="btn-primary mt-2" onClick={handleBackToDashboard}>
              Back to Dashboard
            </button>
          </div>
        ) : (
          <>
            {viewMode === 'bracket' && tournament.bracket && (
              <BracketView
                bracket={tournament.bracket}
                participants={tournament.participants}
                onMatchResult={handleMatchResult}
                onRevertMatch={tournament.status !== 'completed' ? handleRevertMatch : undefined}
                readOnly={tournament.status === 'completed'}
              />
            )}

            {viewMode === 'participants' && (
              <div className="participants-view">
                <h2>Participants</h2>
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
