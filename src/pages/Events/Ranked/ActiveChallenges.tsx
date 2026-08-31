import { useState, useEffect } from 'react';
import { DuelChallenge } from '@/models/duel';
import { GlobalParticipant } from '@/models/types';
import { useAuth } from '@/contexts/AuthContext';
import PlayerDropdown from '@/components/PlayerDropdown/PlayerDropdown';
import { 
  createDuelChallenge, 
  acceptDuelChallenge,
  declineDuelChallenge,
  getAllChallengesAsync,
  expireOldChallenges,
} from '@/services/duels/duelService';
import { getAllParticipantsAsync } from '@/services/participants/participantService';
import './ActiveChallenges.css';

interface ActiveChallengesProps {
  onChallengeSelect: (challenge: { id: string; challengerId: string; challengedId: string }) => void;
}

function ActiveChallenges({ onChallengeSelect }: ActiveChallengesProps) {
  const { user, isAdmin } = useAuth();
  const [allChallenges, setAllChallenges] = useState<DuelChallenge[]>([]);
  const [participants, setParticipants] = useState<GlobalParticipant[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [duelType, setDuelType] = useState<'normal' | 'mandatory'>('normal');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'accepted' | 'completed' | 'pending_review' | 'expired'>('all');
  const [filterParticipantId, setFilterParticipantId] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Auto-set player1 to current user's participant if not admin
    if (!isAdmin && user?.participantId && showCreateModal) {
      setPlayer1Id(user.participantId);
    }
  }, [isAdmin, user, showCreateModal]);

  const loadData = async () => {
    // First expire old challenges (this may update ELO on server)
    await expireOldChallenges();
    
    // Then reload everything to get updated state
    const [all, allParticipants] = await Promise.all([
      getAllChallengesAsync(),
      getAllParticipantsAsync(),
    ]);
    setAllChallenges(all);
    setParticipants(allParticipants);
  };

  const handleCreateChallenge = async () => {
    if (!player1Id || !player2Id) return;
    setCreateError('');
    
    try {
      const challenge = await createDuelChallenge(player1Id, player2Id, duelType);
      if (challenge) {
        await loadData();
        setShowCreateModal(false);
        setPlayer1Id('');
        setPlayer2Id('');
        setDuelType('normal');
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create challenge');
    }
  };

  const handleAccept = async (challengeId: string) => {
    await acceptDuelChallenge(challengeId);
    await loadData();
  };

  const handleDecline = async (challengeId: string) => {
    await declineDuelChallenge(challengeId);
    await loadData();
  };

  const handleRecordMatch = (challenge: DuelChallenge) => {
    onChallengeSelect({ id: challenge.id, challengerId: challenge.challengerId, challengedId: challenge.challengedId });
  };

  const getParticipantName = (id: string) => {
    const p = participants.find(p => p.id === id);
    return p ? `${p.name}${p.alias ? ` (${p.alias})` : ''}` : 'Unknown';
  };

  const getParticipantElo = (id: string) => {
    const p = participants.find(p => p.id === id);
    return p?.eloPoints;
  };

  const sortedChallenges = [...allChallenges].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredChallenges = sortedChallenges.filter(c => {
    const statusMatch = filterStatus === 'all' || c.status === filterStatus;
    const participantMatch = !filterParticipantId ||
      c.challengerId === filterParticipantId ||
      c.challengedId === filterParticipantId;
    return statusMatch && participantMatch;
  });

  return (
    <div className="active-challenges">
      <div className="challenges-header">
        <div>
          <h3>Duel Challenges</h3>
          <p className="text-secondary">Manage competitive duel challenges between players</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <i className="fas fa-plus" /> New Challenge
        </button>
      </div>

      <div className="challenges-filters">
        <PlayerDropdown
          participants={participants}
          selectedId={filterParticipantId}
          onSelect={setFilterParticipantId}
          placeholder="Filter by player"
          className="challenge-player-filter"
        />
        <button 
          className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => setFilterStatus('all')}
        >
          All ({allChallenges.length})
        </button>
        <button 
          className={`filter-btn ${filterStatus === 'pending' ? 'active' : ''}`}
          onClick={() => setFilterStatus('pending')}
        >
          Pending ({allChallenges.filter(c => c.status === 'pending').length})
        </button>
        <button 
          className={`filter-btn ${filterStatus === 'accepted' ? 'active' : ''}`}
          onClick={() => setFilterStatus('accepted')}
        >
          Accepted ({allChallenges.filter(c => c.status === 'accepted').length})
        </button>
        {isAdmin && (
          <button 
            className={`filter-btn ${filterStatus === 'pending_review' ? 'active' : ''}`}
            onClick={() => setFilterStatus('pending_review')}
          >
            Pending Review ({allChallenges.filter(c => c.status === 'pending_review').length})
          </button>
        )}
        <button 
          className={`filter-btn ${filterStatus === 'completed' ? 'active' : ''}`}
          onClick={() => setFilterStatus('completed')}
        >
          Completed ({allChallenges.filter(c => c.status === 'completed').length})
        </button>
        <button 
          className={`filter-btn ${filterStatus === 'expired' ? 'active' : ''}`}
          onClick={() => setFilterStatus('expired')}
        >
          Expired ({allChallenges.filter(c => c.status === 'expired').length})
        </button>
      </div>

      {filteredChallenges.length === 0 ? (
        <div className="empty-state card">
          <i className="fas fa-khanda" style={{ fontSize: '3rem', color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <h3>No challenges found</h3>
          <p className="text-secondary">
            {filterParticipantId ? 'Try a different player or status filter' : 'Create a new challenge to get started'}
          </p>
          {!filterParticipantId && (
            <button className="btn-primary mt-2" onClick={() => setShowCreateModal(true)}>
              <i className="fas fa-plus" /> New Challenge
            </button>
          )}
        </div>
      ) : (
        <div className="challenges-list">
          {filteredChallenges.map(challenge => (
            <div key={challenge.id} className={`challenge-card card challenge-card--${challenge.status}`}>
              <div className="challenge-main">
                <div className="challenge-players">
                  <div className="challenge-player">
                    <span className="player-name">{getParticipantName(challenge.challengerId)}</span>
                    <span className="player-elo">{getParticipantElo(challenge.challengerId)} ELO</span>
                  </div>
                  <div className="challenge-vs">
                    <i className="fas fa-khanda" />
                  </div>
                  <div className="challenge-player">
                    <span className="player-name">{getParticipantName(challenge.challengedId)}</span>
                    <span className="player-elo">{getParticipantElo(challenge.challengedId)} ELO</span>
                  </div>
                </div>

                <div className="challenge-meta">
                  <span className={`challenge-status status-${challenge.status}`}>
                    {challenge.status === 'pending' && <i className="fas fa-clock" />}
                    {challenge.status === 'accepted' && <i className="fas fa-check" />}
                    {challenge.status === 'completed' && <i className="fas fa-check-circle" />}
                    {challenge.status === 'declined' && <i className="fas fa-times" />}
                    {' '}{challenge.status}
                  </span>
                  <span className="challenge-date">
                    {new Date(challenge.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="challenge-actions">
                {challenge.status === 'pending' && (isAdmin || user?.participantId === challenge.challengedId) && (
                  <>
                    <button 
                      className="btn-success btn-sm"
                      onClick={() => handleAccept(challenge.id)}
                      title="Accept challenge"
                    >
                      <i className="fas fa-check" /> Accept
                    </button>
                    <button 
                      className="btn-danger btn-sm"
                      onClick={() => handleDecline(challenge.id)}
                      title="Decline challenge"
                    >
                      <i className="fas fa-times" /> Decline
                    </button>
                  </>
                )}
                {challenge.status === 'accepted' && (
                  <>
                    {(user?.participantId === challenge.challengerId || user?.participantId === challenge.challengedId || isAdmin) && (
                      <button 
                        className="btn-primary btn-sm"
                        onClick={() => handleRecordMatch(challenge)}
                        title="Report match result"
                      >
                        <i className="fas fa-gamepad" /> Report Result
                      </button>
                    )}
                  </>
                )}
                {challenge.status === 'pending_review' && isAdmin && (
                  <button 
                    className="btn-warning btn-sm"
                    onClick={() => handleRecordMatch(challenge)}
                    title="Resolve conflict"
                  >
                    <i className="fas fa-gavel" /> Resolve Conflict
                  </button>
                )}
                {challenge.status === 'completed' && challenge.matchId && (
                  <span className="challenge-completed-badge">
                    <i className="fas fa-trophy" /> Match Recorded
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateModal(false); setCreateError(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-khanda" /> Create Duel Challenge</h2>
              <button className="btn-icon" onClick={() => setShowCreateModal(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              {createError && <div className="error-message">{createError}</div>}
              
              <div className="form-group">
                <label>Duel Type</label>
                <div className="duel-type-selector">
                  <label className="duel-type-option">
                    <input
                      type="radio"
                      name="duelType"
                      value="normal"
                      checked={duelType === 'normal'}
                      onChange={() => setDuelType('normal')}
                    />
                    <span>Normal Challenge</span>
                    <small>Can be declined. Double ELO penalty if opponent doesn't confirm after expiration.</small>
                  </label>
                  <label className="duel-type-option">
                    <input
                      type="radio"
                      name="duelType"
                      value="mandatory"
                      checked={duelType === 'mandatory'}
                      onChange={() => setDuelType('mandatory')}
                    />
                    <span>Mandatory Challenge</span>
                    <small>Cannot be declined. Triple ELO penalty if opponent doesn't confirm. Only 1 per opponent per month.</small>
                  </label>
                </div>
              </div>

              {isAdmin ? (
                <>
                  <div className="form-group">
                    <label>Player 1 (Challenger)</label>
                    <select
                      value={player1Id}
                      onChange={e => { setPlayer1Id(e.target.value); setCreateError(''); }}
                      className="form-control"
                    >
                      <option value="">-- Select player --</option>
                      {participants
                        .filter(p => p.id !== player2Id)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.alias ? `${p.alias} (${p.name})` : p.name} - {p.eloPoints != null ? `${p.eloPoints} ELO` : 'unranked'}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Player 2 (Challenged)</label>
                    <select
                      value={player2Id}
                      onChange={e => { setPlayer2Id(e.target.value); setCreateError(''); }}
                      className="form-control"
                    >
                      <option value="">-- Select player --</option>
                      {participants
                        .filter(p => p.id !== player1Id)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.alias ? `${p.alias} (${p.name})` : p.name} - {p.eloPoints != null ? `${p.eloPoints} ELO` : 'unranked'}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>You (Challenger)</label>
                    <div className="form-control-static">
                      {getParticipantName(player1Id)} - {getParticipantElo(player1Id)} ELO
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Challenge Player</label>
                    <select
                      value={player2Id}
                      onChange={e => { setPlayer2Id(e.target.value); setCreateError(''); }}
                      className="form-control"
                    >
                      <option value="">-- Select player to challenge --</option>
                      {participants
                        .filter(p => p.id !== player1Id)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.alias ? `${p.alias} (${p.name})` : p.name} - {p.eloPoints != null ? `${p.eloPoints} ELO` : 'unranked'}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => { setShowCreateModal(false); setCreateError(''); }}>
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={handleCreateChallenge}
                disabled={!player1Id || !player2Id}
              >
                <i className="fas fa-plus" /> Create Challenge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActiveChallenges;
