import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TournamentMode, TournamentType, GlobalParticipant, TeamSize, SeedingMode, PartialSeedCount } from '@/models/types';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import {
  createTournament,
  addParticipant,
  addTeam,
  removeParticipant,
  updateParticipantName,
  moveParticipant,
  shuffleParticipants,
  startTournament,
  getTournament,
} from '@/services/tournament/tournamentService';
import { searchParticipants } from '@/services/participants/participantService';
import { MIN_PARTICIPANTS } from '@/constants/tournament';
import Sidebar from '@/components/Sidebar/Sidebar';
import ParticipantsList from '@/components/Participants/ParticipantsList';
import BracketPreview from '@/components/Bracket/BracketPreview';
import AddTeamModal from '@/components/AddTeamModal/AddTeamModal';
import SeedingPreview from '@/components/SeedingPreview/SeedingPreview';
import './CreateTournament.css';

type ViewMode = 'participants' | 'bracket' | 'seeding-preview';

function CreateTournament() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [tournamentId, setTournamentId] = useState<string | null>(id || null);
  const [tournamentName, setTournamentName] = useState('');
  const [mode, setMode] = useState<TournamentMode>('double_elimination');
  const [type, setType] = useState<TournamentType>('singles');
  const [teamSize, setTeamSize] = useState<TeamSize>(2);
  const [seedingMode, setSeedingMode] = useState<SeedingMode>('none');
  const [partialSeedCount, setPartialSeedCount] = useState<PartialSeedCount>(8);
  const [viewMode, setViewMode] = useState<ViewMode>('participants');
  const [participants, setParticipants] = useState<any[]>([]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [error, setError] = useState('');
  const [isCreated, setIsCreated] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<GlobalParticipant[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tournamentId) {
      loadTournamentData();
      setViewMode('participants');
    }
  }, [tournamentId]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadTournamentData = () => {
    if (!tournamentId) return;
    const tournament = getTournament(tournamentId);
    if (tournament) {
      setTournamentName(tournament.name);
      setMode(tournament.mode);
      setType(tournament.type || 'singles');
      setTeamSize(tournament.teamSize || 2);
      setParticipants(tournament.participants);
      setIsCreated(true);
    }
  };

  // ── Autocomplete ──────────────────────────────────────────────────────

  const handleNameInput = (value: string) => {
    setNewParticipantName(value);
    setHighlightedIdx(-1);
    if (value.trim().length >= 1) {
      // Filter out participants already in this tournament
      const alreadyAdded = new Set(participants.map((p: any) => p.name.toLowerCase()));
      const results = searchParticipants(value).filter(
        (s) => !alreadyAdded.has(s.name.toLowerCase())
      );
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: GlobalParticipant) => {
    setNewParticipantName(suggestion.name);
    setSuggestions([]);
    setShowSuggestions(false);
    // Immediately add
    doAddParticipant(suggestion.name);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIdx((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === 'Enter' && highlightedIdx >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[highlightedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      handleAddParticipant();
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleCreateTournament = async () => {
    if (!tournamentName.trim()) {
      setError('Please enter a tournament name');
      return;
    }
    try {
      const tournament = await createTournament(
        tournamentName, 
        mode, 
        type,
        type === 'teams' ? teamSize : undefined,
        type === 'singles' ? seedingMode : undefined,
        type === 'singles' && seedingMode === 'partial' ? partialSeedCount : undefined
      );
      setTournamentId(tournament.id);
      setIsCreated(true);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const doAddParticipant = async (name: string) => {
    if (!tournamentId || !name.trim()) return;
    setAdding(true);
    setError('');
    setSuggestions([]);
    setShowSuggestions(false);
    try {
      const tournament = await addParticipant(tournamentId, name.trim());
      setParticipants(tournament.participants);
      setNewParticipantName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
      // Wait for React to re-enable the input before focusing.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const handleAddParticipant = () => {
    doAddParticipant(newParticipantName);
  };

  const handleAddTeam = async (teamName: string, memberNames: string[]) => {
    if (!tournamentId) return;
    setAdding(true);
    setError('');
    setShowAddTeamModal(false);
    try {
      const tournament = await addTeam(tournamentId, teamName, memberNames);
      setParticipants(tournament.participants);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
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
    
    // If seeding is enabled for singles, show preview
    if (type === 'singles' && seedingMode !== 'none') {
      setViewMode('seeding-preview');
      return;
    }
    
    setShowStartConfirm(true);
  };

  const confirmStartTournament = async () => {
    if (!tournamentId) return;
    setShowStartConfirm(false);
    try {
      await startTournament(tournamentId);
      navigate(`/events/tournaments/${tournamentId}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const cancelStartTournament = () => setShowStartConfirm(false);

  const getExcludedTeamMemberNames = (): string[] => {
    // Names of all players already in other teams in this tournament
    return participants
      .filter((p) => p.members && p.members.length > 0)
      .flatMap((p) => p.members.map((m: { name?: string }) => m.name))
      .filter(Boolean);
  };

  const handleCancel = () => navigate('/');

  const sidebarItems = [
    { id: 'setup', label: 'Tournament Setup', active: !isCreated },
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
                <label>Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TournamentType)}
                  className="w-full"
                >
                  <option value="singles">Singles</option>
                  <option value="teams">Teams</option>
                </select>
                <p className="text-secondary text-sm mt-1">
                  {type === 'singles' 
                    ? 'Individual players compete' 
                    : 'Teams of multiple players compete together'}
                </p>
              </div>

              {type === 'teams' && (
                <div className="form-group">
                  <label>Team Size</label>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(Number(e.target.value) as TeamSize)}
                    className="w-full"
                  >
                    <option value={2}>2v2 (Doubles)</option>
                    <option value={3}>3v3 (Triples)</option>
                    <option value={4}>4v4 (Squads)</option>
                    <option value={5}>5v5 (Teams)</option>
                  </select>
                  <p className="text-secondary text-sm mt-1">
                    Each team will have {teamSize} players
                  </p>
                </div>
              )}

              <div className="form-group">
                <label>Bracket Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as TournamentMode)}
                  className="w-full"
                >
                  <option value="double_elimination">Double Elimination</option>
                  <option value="single_elimination">Single Elimination</option>
                </select>
              </div>

              {type === 'singles' && (
                <div className="form-group">
                  <label>Seeding</label>
                  <select
                    value={seedingMode}
                    onChange={(e) => setSeedingMode(e.target.value as SeedingMode)}
                    className="w-full"
                  >
                    <option value="none">Manual (current order)</option>
                    <option value="full">Full ranking seeding</option>
                    <option value="partial">Partial seeding (top seeds only)</option>
                  </select>
                  {seedingMode === 'partial' && (
                    <div className="mt-2">
                      <label className="text-sm">Top seeds to place:</label>
                      <select
                        value={partialSeedCount}
                        onChange={(e) => setPartialSeedCount(Number(e.target.value) as PartialSeedCount)}
                        className="w-full mt-1"
                      >
                        <option value={4}>Top 4</option>
                        <option value={8}>Top 8</option>
                        <option value={16}>Top 16</option>
                      </select>
                    </div>
                  )}
                  <p className="text-secondary text-sm mt-1">
                    {seedingMode === 'none' && 'Participants stay in the order you add them'}
                    {seedingMode === 'full' && 'All participants ranked by ELO + win rate'}
                    {seedingMode === 'partial' && `Top ${partialSeedCount} ranked, rest randomized`}
                  </p>
                </div>
              )}

              <div className="form-actions">
                <button className="btn-outline" onClick={handleCancel}>Cancel</button>
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

                  {type === 'singles' ? (
                    <div className="add-participant-form card">
                      <div className="autocomplete-wrapper">
                        <div className="flex gap-2">
                          <div className="autocomplete-input-wrap flex-1">
                            <input
                              ref={inputRef}
                              type="text"
                              value={newParticipantName}
                              onChange={(e) => handleNameInput(e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              onFocus={() => {
                                if (suggestions.length > 0) setShowSuggestions(true);
                              }}
                              placeholder="Enter or search participant name…"
                              className="w-full"
                              disabled={adding}
                              autoComplete="off"
                            />
                            {showSuggestions && suggestions.length > 0 && (
                              <div className="autocomplete-dropdown" ref={suggestionsRef}>
                                {suggestions.map((s, idx) => (
                                  <div
                                    key={s.id}
                                    className={`autocomplete-item ${idx === highlightedIdx ? 'highlighted' : ''}`}
                                    onMouseDown={() => selectSuggestion(s)}
                                  >
                                    <span className="autocomplete-item-name">{s.name}</span>
                                    {s.alias && (
                                      <span className="autocomplete-item-alias">{s.alias}</span>
                                    )}
                                    <span className="autocomplete-item-stats">
                                      {(s.tournamentIds ?? []).length} played
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            className="btn-primary"
                            onClick={handleAddParticipant}
                            disabled={adding}
                          >
                            {adding ? '…' : 'Add'}
                          </button>
                        </div>
                        <p className="autocomplete-hint text-secondary text-sm">
                          Type to search existing participants, or enter a new name to create one
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="add-participant-form card">
                      <button
                        className="btn-primary w-full"
                        onClick={() => setShowAddTeamModal(true)}
                        disabled={adding}
                      >
                        <i className="fas fa-users"></i> Add Team
                      </button>
                      <p className="text-secondary text-sm mt-2">
                        Click to add a team of {teamSize} players
                      </p>
                    </div>
                  )}

                  {participants.length > 0 && (
                    <div className="participants-actions card">
                      <button className="btn-outline" onClick={handleShuffleParticipants}>
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
                    <button className="btn-outline" onClick={handleCancel}>Cancel</button>
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

              {viewMode === 'seeding-preview' && (
                <SeedingPreview
                  tournamentId={tournamentId!}
                  participants={participants}
                  seedingMode={seedingMode}
                  partialSeedCount={partialSeedCount}
                  onBack={() => setViewMode('participants')}
                  onConfirm={() => setShowStartConfirm(true)}
                  onParticipantsChange={setParticipants}
                />
              )}

              {viewMode === 'bracket' && (
                <div className="bracket-preview-section">
                  <h2>Bracket Preview</h2>
                  <p className="text-secondary mb-3">
                    Preview how the bracket will look with current participants
                  </p>

                  <BracketPreview participants={participants} />

                  <div className="form-actions mt-3">
                    <button className="btn-outline" onClick={() => setViewMode('participants')}>
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

      <ConfirmModal
        isOpen={showStartConfirm}
        title="Start Tournament"
        message={`Are you sure you want to start "${tournamentName}" with ${participants.length} participants? This will generate the bracket and cannot be undone.`}
        confirmText="Start"
        onConfirm={confirmStartTournament}
        onCancel={cancelStartTournament}
      />

      <AddTeamModal
        isOpen={showAddTeamModal}
        teamSize={teamSize}
        excludedNames={getExcludedTeamMemberNames()}
        onConfirm={handleAddTeam}
        onCancel={() => setShowAddTeamModal(false)}
      />
    </div>
  );
}

export default CreateTournament;
