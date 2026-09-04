import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DuelChallenge } from '@/models/duel';
import { GlobalParticipant } from '@/models/types';
import { GAMES } from '@/data/games';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import PlayerDropdown from '@/components/PlayerDropdown/PlayerDropdown';
import { 
  createDuelChallenge, 
  acceptDuelChallenge,
  declineDuelChallenge,
  getAllChallengesAsync,
  expireOldChallenges,
  getDuelSettingsAsync,
} from '@/services/duels/duelService';
import { getAllParticipantsAsync } from '@/services/participants/participantService';
import { DEFAULT_DUEL_SETTINGS, DuelSettings } from '@/models/duel';
import { getParticipantElo as getGameElo } from '@/utils/participantGames';
import './ActiveChallenges.css';

interface ActiveChallengesProps {
  onChallengeSelect: (challenge: { id: string; challengerId: string; challengedId: string }) => void;
}

function ActiveChallenges({ onChallengeSelect }: ActiveChallengesProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentCommunity, isInMyCommunity, canAdminCurrentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;

  // User belongs to this community (or is superadmin)
  const isAdminHere = canAdminCurrentCommunity;
  // Regular participant in this community can create/accept challenges
  const canInteract = isInMyCommunity && user != null;
  const [allChallenges, setAllChallenges] = useState<DuelChallenge[]>([]);
  const [participants, setParticipants] = useState<GlobalParticipant[]>([]);
  const [settings, setSettings] = useState<DuelSettings>(DEFAULT_DUEL_SETTINGS);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [duelGameId, setDuelGameId] = useState<string>(GAMES[0]?.id ?? 'ssbu');
  const [duelType, setDuelType] = useState<'normal' | 'mandatory'>('normal');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'accepted' | 'completed' | 'pending_review' | 'expired'>('all');
  const [filterParticipantId, setFilterParticipantId] = useState<string | null>(null);
  const [filterGameId, setFilterGameId] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadData();
  }, [communityId]);

  useEffect(() => {
    // Auto-set player1 to current user's participant if not admin
    if (!isAdminHere && user?.participantId && showCreateModal) {
      setPlayer1Id(user.participantId);
    }
  }, [isAdminHere, user, showCreateModal]);

  const loadData = async () => {
    if (!communityId) return;
    // First expire old challenges (this may update ELO on server)
    await expireOldChallenges(communityId);

    // Then reload everything to get updated state
    const [all, allParticipants, duelSettings] = await Promise.all([
      getAllChallengesAsync(communityId),
      getAllParticipantsAsync(communityId),
      getDuelSettingsAsync(communityId),
    ]);
    setAllChallenges(all);
    setParticipants(allParticipants);
    setSettings(duelSettings);
  };

  const handleCreateChallenge = async () => {
    if (!player1Id || !player2Id) return;
    setCreateError('');
    
    try {
      if (!communityId) return;
      const challenge = await createDuelChallenge(player1Id, player2Id, duelGameId, duelType, communityId);
      if (challenge) {
        await loadData();
        setShowCreateModal(false);
        setPlayer1Id('');
        setPlayer2Id('');
        setDuelGameId(GAMES[0]?.id ?? 'ssbu');
        setDuelType('normal');
      }
    } catch (err: any) {
      setCreateError(err.message || t('ranked.challenges.failedCreate'));
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
    return p ? `${p.name}${p.alias ? ` (${p.alias})` : ''}` : t('history.unknownPlayer');
  };

  const getParticipantElo = (id: string, gameId: string = duelGameId) => {
    const p = participants.find(p => p.id === id);
    return p ? getGameElo(p, gameId) : null;
  };

  const sortedChallenges = [...allChallenges].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredChallenges = sortedChallenges.filter(c => {
    const statusMatch = filterStatus === 'all' || c.status === filterStatus;
    const participantMatch = !filterParticipantId ||
      c.challengerId === filterParticipantId ||
      c.challengedId === filterParticipantId;
    const gameMatch = !filterGameId || c.gameId === filterGameId;
    return statusMatch && participantMatch && gameMatch;
  });

  return (
    <div className="active-challenges">
      <div className="challenges-header">
        <div>
          <h3>{t('ranked.challenges.title')}</h3>
          <p className="text-secondary">{t('ranked.challenges.subtitle')}</p>
        </div>
        {canInteract && (
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            <i className="fas fa-plus" /> {t('ranked.newChallenge')}
          </button>
        )}
      </div>

      <div className="challenges-filters">
        <PlayerDropdown
          participants={participants}
          selectedId={filterParticipantId}
          onSelect={setFilterParticipantId}
          placeholder={t('ranked.challenges.filterByPlayer')}
          className="challenge-player-filter"
        />
        <select
          className="challenge-game-filter"
          value={filterGameId ?? ''}
          onChange={(e) => setFilterGameId(e.target.value || null)}
        >
          <option value="">{t('ranked.challenges.allGames')}</option>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>{g.id.toUpperCase()}</option>
          ))}
        </select>
        <button
          className={`filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => setFilterStatus('all')}
        >
          {t('ranked.challenges.all')} ({allChallenges.length})
        </button>
        <button
          className={`filter-btn ${filterStatus === 'pending' ? 'active' : ''}`}
          onClick={() => setFilterStatus('pending')}
        >
          {t('ranked.challenges.pending')} ({allChallenges.filter(c => c.status === 'pending').length})
        </button>
        <button
          className={`filter-btn ${filterStatus === 'accepted' ? 'active' : ''}`}
          onClick={() => setFilterStatus('accepted')}
        >
          {t('ranked.challenges.accepted')} ({allChallenges.filter(c => c.status === 'accepted').length})
        </button>
        {isAdminHere && (
          <button
            className={`filter-btn ${filterStatus === 'pending_review' ? 'active' : ''}`}
            onClick={() => setFilterStatus('pending_review')}
          >
            {t('ranked.challenges.pendingReview')} ({allChallenges.filter(c => c.status === 'pending_review').length})
          </button>
        )}
        <button
          className={`filter-btn ${filterStatus === 'completed' ? 'active' : ''}`}
          onClick={() => setFilterStatus('completed')}
        >
          {t('ranked.challenges.completed')} ({allChallenges.filter(c => c.status === 'completed').length})
        </button>
        <button
          className={`filter-btn ${filterStatus === 'expired' ? 'active' : ''}`}
          onClick={() => setFilterStatus('expired')}
        >
          {t('ranked.challenges.expired')} ({allChallenges.filter(c => c.status === 'expired').length})
        </button>
      </div>

      {filteredChallenges.length === 0 ? (
        <div className="empty-state card">
          <i className="fas fa-khanda" style={{ fontSize: '3rem', color: 'var(--text-secondary)', marginBottom: '1rem' }} />
          <h3>{t('ranked.challenges.noChallenges')}</h3>
          <p className="text-secondary">
            {filterParticipantId ? t('ranked.challenges.noChallengesFilter') : canInteract ? t('ranked.challenges.noChallengesCreate') : t('ranked.challenges.noChallengesCommunity')}
          </p>
          {!filterParticipantId && canInteract && (
            <button className="btn-primary mt-2" onClick={() => setShowCreateModal(true)}>
              <i className="fas fa-plus" /> {t('ranked.newChallenge')}
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
                    <span className="player-elo">{getParticipantElo(challenge.challengerId, challenge.gameId)} {t('ranked.challenges.elo')}</span>
                  </div>
                  <div className="challenge-vs">
                    <i className="fas fa-khanda" />
                  </div>
                  <div className="challenge-player">
                    <span className="player-name">{getParticipantName(challenge.challengedId)}</span>
                    <span className="player-elo">{getParticipantElo(challenge.challengedId, challenge.gameId)} {t('ranked.challenges.elo')}</span>
                  </div>
                </div>

                <div className="challenge-meta">
                  <span className="challenge-game">{challenge.gameId?.toUpperCase()}</span>
                  <span className={`challenge-status status-${challenge.status}`}>
                    {challenge.status === 'pending' && <i className="fas fa-clock" />}
                    {challenge.status === 'accepted' && <i className="fas fa-check" />}
                    {challenge.status === 'completed' && <i className="fas fa-check-circle" />}
                    {challenge.status === 'declined' && <i className="fas fa-times" />}
                    {' '}{t(`ranked.challenges.${challenge.status}` as any, { defaultValue: challenge.status })}
                  </span>
                  <span className="challenge-date">
                    {new Date(challenge.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="challenge-actions">
                {challenge.status === 'pending' && canInteract && (isAdminHere || user?.participantId === challenge.challengedId) && (
                  <>
                    <button
                      className="btn-success btn-sm"
                      onClick={() => handleAccept(challenge.id)}
                      title={t('ranked.challenges.accept')}
                    >
                      <i className="fas fa-check" /> {t('ranked.challenges.accept')}
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDecline(challenge.id)}
                      title={t('ranked.challenges.decline')}
                    >
                      <i className="fas fa-times" /> {t('ranked.challenges.decline')}
                    </button>
                  </>
                )}
                {challenge.status === 'accepted' && canInteract && (
                  <>
                    {(user?.participantId === challenge.challengerId || user?.participantId === challenge.challengedId || isAdminHere) && (
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => handleRecordMatch(challenge)}
                        title={t('ranked.challenges.reportResult')}
                      >
                        <i className="fas fa-gamepad" /> {t('ranked.challenges.reportResult')}
                      </button>
                    )}
                  </>
                )}
                {challenge.status === 'pending_review' && isAdminHere && (
                  <button
                    className="btn-warning btn-sm"
                    onClick={() => handleRecordMatch(challenge)}
                    title={t('ranked.challenges.resolveConflict')}
                  >
                    <i className="fas fa-gavel" /> {t('ranked.challenges.resolveConflict')}
                  </button>
                )}
                {challenge.status === 'completed' && challenge.matchId && (
                  <span className="challenge-completed-badge">
                    <i className="fas fa-trophy" /> {t('ranked.challenges.matchRecorded')}
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
              <h2><i className="fas fa-khanda" /> {t('ranked.challenges.createTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowCreateModal(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              {createError && <div className="error-message">{createError}</div>}

              <div className="form-group">
                <label>{t('ranked.challenges.gameLabel')}</label>
                <select
                  value={duelGameId}
                  onChange={e => { setDuelGameId(e.target.value); setCreateError(''); }}
                  className="form-control"
                >
                  {GAMES.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{t('ranked.challenges.duelType')}</label>
                <div className="duel-type-selector">
                  <label className="duel-type-option">
                    <input
                      type="radio"
                      name="duelType"
                      value="normal"
                      checked={duelType === 'normal'}
                      onChange={() => setDuelType('normal')}
                    />
                    <span>{t('ranked.challenges.normalChallenge')}</span>
                    <small>{t('ranked.challenges.normalHint')}</small>
                  </label>
                  {settings.mandatoryDuelsEnabled !== false && (
                    <label className="duel-type-option">
                      <input
                        type="radio"
                        name="duelType"
                        value="mandatory"
                        checked={duelType === 'mandatory'}
                        onChange={() => setDuelType('mandatory')}
                      />
                      <span>{t('ranked.challenges.mandatoryChallenge')}</span>
                      <small>
                        {t('ranked.challenges.mandatoryHint', { count: settings.mandatoryDuelsPerWeek ?? 1 })}
                      </small>
                    </label>
                  )}
                </div>
              </div>

              {isAdminHere ? (
                <>
                  <div className="form-group">
                    <label>{t('ranked.challenges.player1')}</label>
                    <select
                      value={player1Id}
                      onChange={e => { setPlayer1Id(e.target.value); setCreateError(''); }}
                      className="form-control"
                    >
                      <option value="">{t('ranked.challenges.selectPlayer')}</option>
                      {participants
                        .filter(p => p.id !== player2Id && p.games?.[duelGameId] != null)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.alias ? `${p.alias} (${p.name})` : p.name} - {getGameElo(p, duelGameId) != null ? `${getGameElo(p, duelGameId)} ${t('ranked.challenges.elo')}` : t('ranked.challenges.unranked')}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('ranked.challenges.player2')}</label>
                    <select
                      value={player2Id}
                      onChange={e => { setPlayer2Id(e.target.value); setCreateError(''); }}
                      className="form-control"
                    >
                      <option value="">{t('ranked.challenges.selectPlayer')}</option>
                      {participants
                        .filter(p => p.id !== player1Id && p.games?.[duelGameId] != null)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.alias ? `${p.alias} (${p.name})` : p.name} - {getGameElo(p, duelGameId) != null ? `${getGameElo(p, duelGameId)} ${t('ranked.challenges.elo')}` : t('ranked.challenges.unranked')}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>{t('ranked.challenges.you')}</label>
                    <div className="form-control-static">
                      {getParticipantName(player1Id)} - {getParticipantElo(player1Id)} {t('ranked.challenges.elo')}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t('ranked.challenges.challengePlayer')}</label>
                    <select
                      value={player2Id}
                      onChange={e => { setPlayer2Id(e.target.value); setCreateError(''); }}
                      className="form-control"
                    >
                      <option value="">{t('ranked.challenges.selectPlayerToChallenge')}</option>
                      {participants
                        .filter(p => p.id !== player1Id && p.games?.[duelGameId] != null)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.alias ? `${p.alias} (${p.name})` : p.name} - {getGameElo(p, duelGameId) != null ? `${getGameElo(p, duelGameId)} ${t('ranked.challenges.elo')}` : t('ranked.challenges.unranked')}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => { setShowCreateModal(false); setCreateError(''); }}>
                {t('ranked.challenges.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateChallenge}
                disabled={!player1Id || !player2Id}
              >
                <i className="fas fa-plus" /> {t('ranked.challenges.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActiveChallenges;
