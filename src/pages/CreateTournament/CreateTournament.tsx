import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import { useCommunity } from '@/contexts/CommunityContext';
import Sidebar from '@/components/Sidebar/Sidebar';
import ParticipantsList from '@/components/Participants/ParticipantsList';
import BracketPreview from '@/components/Bracket/BracketPreview';
import AddTeamModal from '@/components/AddTeamModal/AddTeamModal';
import SeedingPreview from '@/components/SeedingPreview/SeedingPreview';
import './CreateTournament.css';

type ViewMode = 'participants' | 'bracket' | 'seeding-preview';

function CreateTournament() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currentCommunity, getPath } = useCommunity();
  const [tournamentId, setTournamentId] = useState<string | null>(id || null);
  const [tournamentName, setTournamentName] = useState('');
  const [mode, setMode] = useState<TournamentMode>('double_elimination');
  const [type, setType] = useState<TournamentType>('singles');
  const [teamSize, setTeamSize] = useState<TeamSize>(2);
  const [seedingMode, setSeedingMode] = useState<SeedingMode>('none');
  const [partialSeedCount, setPartialSeedCount] = useState<PartialSeedCount>(8);
  const [givesPoints, setGivesPoints] = useState(true);
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
      setGivesPoints(tournament.givesPoints !== false);
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
      setError(t('tournament.create.errors.nameRequired'));
      return;
    }
    try {
      const tournament = await createTournament(
        tournamentName,
        mode,
        type,
        type === 'teams' ? teamSize : undefined,
        type === 'singles' ? seedingMode : undefined,
        type === 'singles' && seedingMode === 'partial' ? partialSeedCount : undefined,
        givesPoints,
        currentCommunity?.id ?? DEFAULT_COMMUNITY_ID
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
      setError(t('tournament.create.errors.minParticipants', { min: MIN_PARTICIPANTS }));
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
      navigate(getPath(`events/tournaments/${tournamentId}`));
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

  const handleCancel = () => navigate(getPath('events'));

  const sidebarItems = [
    { id: 'setup', label: t('tournament.create.sidebarSetup'), active: !isCreated },
    {
      id: 'participants',
      label: t('tournament.create.sidebarParticipants'),
      count: participants.length,
      active: isCreated && viewMode === 'participants',
      onClick: () => setViewMode('participants'),
    },
    {
      id: 'bracket',
      label: t('tournament.create.bracketPreviewTitle'),
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
              <h2>{t('tournament.create.title')}</h2>

              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label>{t('tournament.create.nameLabel')}</label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder={t('tournament.create.namePlaceholder')}
                  className="w-full"
                />
              </div>

              <div className="form-group">
                <label>{t('tournament.create.typeLabel')}</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TournamentType)}
                  className="w-full"
                >
                  <option value="singles">{t('tournament.create.typeSingles')}</option>
                  <option value="teams">{t('tournament.create.typeTeams')}</option>
                </select>
                <p className="text-secondary text-sm mt-1">
                  {type === 'singles'
                    ? t('tournament.create.typeSinglesDesc')
                    : t('tournament.create.typeTeamsDesc')}
                </p>
              </div>

              {type === 'teams' && (
                <div className="form-group">
                  <label>{t('tournament.create.teamSizeLabel')}</label>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(Number(e.target.value) as TeamSize)}
                    className="w-full"
                  >
                    <option value={2}>{t('tournament.create.teamSize2')}</option>
                    <option value={3}>{t('tournament.create.teamSize3')}</option>
                    <option value={4}>{t('tournament.create.teamSize4')}</option>
                    <option value={5}>{t('tournament.create.teamSize5')}</option>
                  </select>
                  <p className="text-secondary text-sm mt-1">
                    {t('tournament.create.teamSizeHint', { count: teamSize })}
                  </p>
                </div>
              )}

              <div className="form-group">
                <label>{t('tournament.create.modeLabel')}</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as TournamentMode)}
                  className="w-full"
                >
                  <option value="double_elimination">{t('tournament.create.modeDouble')}</option>
                  <option value="single_elimination">{t('tournament.create.modeSingle')}</option>
                </select>
              </div>

              <div className="form-group form-group--inline">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={givesPoints}
                    onChange={(e) => setGivesPoints(e.target.checked)}
                  />
                  <span>{t('tournament.create.pointsCheckbox')}</span>
                </label>
                <p className="text-secondary text-sm mt-1">
                  {givesPoints
                    ? t('tournament.create.pointsHintYes')
                    : t('tournament.create.pointsHintNo')}
                </p>
              </div>

              {type === 'singles' && (
                <div className="form-group">
                  <label>{t('tournament.create.seedingLabel')}</label>
                  <select
                    value={seedingMode}
                    onChange={(e) => setSeedingMode(e.target.value as SeedingMode)}
                    className="w-full"
                  >
                    <option value="none">{t('tournament.create.seedingNone')}</option>
                    <option value="full">{t('tournament.create.seedingFull')}</option>
                    <option value="partial">{t('tournament.create.seedingPartial')}</option>
                  </select>
                  {seedingMode === 'partial' && (
                    <div className="mt-2">
                      <label className="text-sm">{t('tournament.create.topSeedsLabel')}</label>
                      <select
                        value={partialSeedCount}
                        onChange={(e) => setPartialSeedCount(Number(e.target.value) as PartialSeedCount)}
                        className="w-full mt-1"
                      >
                        <option value={4}>{t('tournament.create.topSeeds4')}</option>
                        <option value={8}>{t('tournament.create.topSeeds8')}</option>
                        <option value={16}>{t('tournament.create.topSeeds16')}</option>
                      </select>
                    </div>
                  )}
                  <p className="text-secondary text-sm mt-1">
                    {seedingMode === 'none' && t('tournament.create.seedingHintNone')}
                    {seedingMode === 'full' && t('tournament.create.seedingHintFull')}
                    {seedingMode === 'partial' && t('tournament.create.seedingHintPartial', { count: partialSeedCount })}
                  </p>
                </div>
              )}

              <div className="form-actions">
                <button className="btn-outline" onClick={handleCancel}>{t('tournament.create.cancel')}</button>
                <button className="btn-primary" onClick={handleCreateTournament}>
                  {t('tournament.create.createButton')}
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
                        {t('tournament.create.participantsSectionSubtitle', { min: MIN_PARTICIPANTS })}
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
                              placeholder={t('tournament.create.searchPlaceholder')}
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
                                      {t('tournament.create.playedCount', { count: s.tournamentIds?.length ?? 0 })}
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
                            {adding ? t('tournament.create.adding') : t('tournament.create.addButton')}
                          </button>
                        </div>
                        <p className="autocomplete-hint text-secondary text-sm">
                          {t('tournament.create.searchHint')}
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
                        <i className="fas fa-users"></i> {t('tournament.create.addTeamButton')}
                      </button>
                      <p className="text-secondary text-sm mt-2">
                        {t('tournament.create.addTeamHint', { count: teamSize })}
                      </p>
                    </div>
                  )}

                  {participants.length > 0 && (
                    <div className="participants-actions card">
                      <button className="btn-outline" onClick={handleShuffleParticipants}>
                        {t('tournament.create.randomizeOrder')}
                      </button>
                      <span className="text-secondary">
                        {t('tournament.view.participantCount', { count: participants.length })}
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
                    <button className="btn-outline" onClick={handleCancel}>{t('tournament.create.cancel')}</button>
                    <button
                      className="btn-primary"
                      onClick={handleStartTournament}
                      disabled={participants.length < MIN_PARTICIPANTS}
                    >
                      {t('tournament.create.startButton')}
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
                  <h2>{t('tournament.create.bracketPreviewTitle')}</h2>
                  <p className="text-secondary mb-3">
                    {t('tournament.create.bracketPreviewDesc')}
                  </p>

                  <BracketPreview participants={participants} />

                  <div className="form-actions mt-3">
                    <button className="btn-outline" onClick={() => setViewMode('participants')}>
                      {t('tournament.create.bracketPreviewBack')}
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleStartTournament}
                      disabled={participants.length < MIN_PARTICIPANTS}
                    >
                      {t('tournament.create.startButton')}
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
        title={t('tournament.create.startConfirmTitle')}
        message={t('tournament.create.startConfirmMessage', { name: tournamentName, count: participants.length })}
        confirmText={t('tournament.create.startConfirmButton')}
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
