import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TournamentMode } from '@/models/types';
import { 
  createTournament, 
  addParticipant, 
  removeParticipant,
  updateParticipantName,
  moveParticipant,
  shuffleParticipants,
  startTournament,
  getTournament
} from '@/services/tournament/tournamentService';
import { MIN_PARTICIPANTS } from '@/constants/tournament';
import Sidebar from '@/components/Sidebar/Sidebar';
import ParticipantsList from '@/components/Participants/ParticipantsList';
import BracketPreview from '@/components/Bracket/BracketPreview';
import './CreateTournament.css';

type ViewMode = 'participants' | 'bracket';

function CreateTournament() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [tournamentId, setTournamentId] = useState<string | null>(id || null);
  const [tournamentName, setTournamentName] = useState('');
  const [mode, setMode] = useState<TournamentMode>('double_elimination');
  const [viewMode, setViewMode] = useState<ViewMode>('participants');
  const [participants, setParticipants] = useState<any[]>([]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [error, setError] = useState('');
  const [isCreated, setIsCreated] = useState(false);

  useEffect(() => {
    if (tournamentId) {
      loadTournament();
      setViewMode('participants');
    }
  }, [tournamentId]);

  const loadTournament = () => {
    if (!tournamentId) return;
    
    const tournament = getTournament(tournamentId);
    if (tournament) {
      setTournamentName(tournament.name);
      setMode(tournament.mode);
      setParticipants(tournament.participants);
      setIsCreated(true);
    }
  };

  const handleCreateTournament = () => {
    if (!tournamentName.trim()) {
      setError('Please enter a tournament name');
      return;
    }

    try {
      const tournament = createTournament(tournamentName, mode);
      setTournamentId(tournament.id);
      setIsCreated(true);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddParticipant = () => {
    if (!tournamentId) return;
    if (!newParticipantName.trim()) {
      setError('Please enter a participant name');
      return;
    }

    try {
      const tournament = addParticipant(tournamentId, newParticipantName.trim());
      setParticipants(tournament.participants);
      setNewParticipantName('');
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveParticipant = (participantId: string) => {
    if (!tournamentId) return;

    try {
      const tournament = removeParticipant(tournamentId, participantId);
      setParticipants(tournament.participants);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateParticipant = (participantId: string, newName: string) => {
    if (!tournamentId) return;

    try {
      const tournament = updateParticipantName(tournamentId, participantId, newName);
      setParticipants(tournament.participants);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMoveParticipant = (participantId: string, direction: 'up' | 'down') => {
    if (!tournamentId) return;

    try {
      const tournament = moveParticipant(tournamentId, participantId, direction);
      setParticipants(tournament.participants);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleShuffleParticipants = () => {
    if (!tournamentId) return;

    try {
      const tournament = shuffleParticipants(tournamentId);
      setParticipants(tournament.participants);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStartTournament = () => {
    if (!tournamentId) return;

    if (participants.length < MIN_PARTICIPANTS) {
      setError(`Minimum ${MIN_PARTICIPANTS} participants required`);
      return;
    }

    try {
      startTournament(tournamentId);
      navigate(`/tournament/${tournamentId}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = () => {
    navigate('/');
  };

  const sidebarItems = [
    {
      id: 'setup',
      label: 'Tournament Setup',
      active: !isCreated,
    },
    {
      id: 'participants',
      label: 'Participants',
      count: participants.length,
      active: isCreated && viewMode === 'participants',
      onClick: () => setViewMode('participants'),
    },
    {
      id: 'bracket',
      label: 'Bracket Preview',
      active: isCreated && viewMode === 'bracket',
      onClick: () => setViewMode('bracket'),
      disabled: participants.length < MIN_PARTICIPANTS,
    },
  ];

  return (
    <div className="create-tournament">
      <Sidebar items={sidebarItems} />
      
      <div className="create-tournament-content">
        <div className="container">
          {!isCreated ? (
            <div className="setup-form card">
              <h2>Create New Tournament</h2>
              
              {error && <div className="error-message">{error}</div>}
              
              <div className="form-group">
                <label>Tournament Name</label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder="Enter tournament name"
                  className="w-full"
                />
              </div>

              <div className="form-group">
                <label>Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as TournamentMode)}
                  className="w-full"
                >
                  <option value="double_elimination">Double Elimination</option>
                  <option value="single_elimination" disabled>
                    Single Elimination (Coming Soon)
                  </option>
                </select>
              </div>

              <div className="form-actions">
                <button className="btn-outline" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleCreateTournament}>
                  Create Tournament
                </button>
              </div>
            </div>
          ) : (
            <>
              {viewMode === 'participants' && (
                <div className="participants-section">
                  <div className="section-header">
                    <div>
                      <h2>{tournamentName}</h2>
                      <p className="text-secondary">
                        Add participants to your tournament (minimum {MIN_PARTICIPANTS})
                      </p>
                    </div>
                  </div>

                  {error && <div className="error-message">{error}</div>}

                  <div className="add-participant-form card">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newParticipantName}
                        onChange={(e) => setNewParticipantName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddParticipant()}
                        placeholder="Enter participant name"
                        className="flex-1"
                      />
                      <button className="btn-primary" onClick={handleAddParticipant}>
                        Add Participant
                      </button>
                    </div>
                  </div>

                  {participants.length > 0 && (
                    <div className="participants-actions card">
                      <button 
                        className="btn-outline"
                        onClick={handleShuffleParticipants}
                      >
                        Randomize Order
                      </button>
                      <span className="text-secondary">
                        {participants.length} participant{participants.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  <ParticipantsList
                    participants={participants}
                    onRemove={handleRemoveParticipant}
                    onUpdate={handleUpdateParticipant}
                    onMoveUp={(id: string) => handleMoveParticipant(id, 'up')}
                    onMoveDown={(id: string) => handleMoveParticipant(id, 'down')}
                  />

                  <div className="form-actions">
                    <button className="btn-outline" onClick={handleCancel}>
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleStartTournament}
                      disabled={participants.length < MIN_PARTICIPANTS}
                    >
                      Start Tournament
                    </button>
                  </div>
                </div>
              )}

              {viewMode === 'bracket' && (
                <div className="bracket-preview-section">
                  <h2>Bracket Preview</h2>
                  <p className="text-secondary mb-3">
                    Preview how the bracket will look with current participants
                  </p>
                  
                  <BracketPreview participants={participants} />

                  <div className="form-actions mt-3">
                    <button 
                      className="btn-outline" 
                      onClick={() => setViewMode('participants')}
                    >
                      Back to Participants
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleStartTournament}
                      disabled={participants.length < MIN_PARTICIPANTS}
                    >
                      Start Tournament
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreateTournament;
