import { useState, useEffect } from 'react';
import { League, LeagueMatch, GlobalParticipant } from '@/models/types';
import { expireLeagueMatches, cancelMatch, getEligibleForBan, banParticipants, markMatchNoShow } from '@/services/leagues/leagueService';
import ParticipantName from '@/components/ParticipantName/ParticipantName';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import './LeaguePendingTab.css';

interface LeaguePendingTabProps {
  league: League;
  matches: LeagueMatch[];
  participants: Map<string, GlobalParticipant>;
  onMatchUpdated: () => void;
}

function LeaguePendingTab({ league, matches, participants, onMatchUpdated }: LeaguePendingTabProps) {
  const [expiring, setExpiring] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<LeagueMatch | null>(null);
  const [selectedAbsent, setSelectedAbsent] = useState('');
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [eligibleForBan, setEligibleForBan] = useState<Array<{
    participantId: string;
    name: string;
    alias?: string;
    noShowCount: number;
  }>>([]);
  const [selectedToBan, setSelectedToBan] = useState<Set<string>>(new Set());
  const [banWarning, setBanWarning] = useState<{
    participantId: string;
    name: string;
    alias?: string;
    noShowCount: number;
  } | null>(null);

  const pendingReviewMatches = matches.filter(m => m.status === 'pending_review');

  useEffect(() => {
    loadEligibleForBan();
  }, [league.id]);

  async function loadEligibleForBan() {
    const data = await getEligibleForBan(league.id);
    if (data) {
      setEligibleForBan(data.eligible);
    }
  }

  function getParticipantName(id: string): string {
    const p = participants.get(id);
    return p ? (p.alias?.trim() || p.name) : 'Unknown';
  }

  async function handleExpireMatches() {
    setExpiring(true);
    const count = await expireLeagueMatches(league.id);
    setExpiring(false);
    if (count > 0) {
      onMatchUpdated();
    }
  }

  function openNoShowModal(match: LeagueMatch) {
    setSelectedMatch(match);
    setSelectedAbsent(match.participant1Id);
    setShowNoShowModal(true);
  }

  function openCancelModal(match: LeagueMatch) {
    setSelectedMatch(match);
    setShowCancelModal(true);
  }

  async function handleMarkNoShow() {
    if (!selectedMatch || !selectedAbsent) return;
    setProcessing(true);

    try {
      const data = await markMatchNoShow(league.id, selectedMatch.id, selectedAbsent);
      setProcessing(false);

      if (data) {
        setShowNoShowModal(false);
        setSelectedMatch(null);
        setSelectedAbsent('');

        // Check if player is now eligible for ban
        if (data.banEligible) {
          setBanWarning(data.banEligible);
        }

        await loadEligibleForBan();
        onMatchUpdated();
      }
    } catch (err) {
      console.error('Failed to mark no-show:', err);
      setProcessing(false);
    }
  }

  async function handleCancelMatch() {
    if (!selectedMatch) return;
    setProcessing(true);
    const success = await cancelMatch(league.id, selectedMatch.id);
    setProcessing(false);
    if (success) {
      setShowCancelModal(false);
      setSelectedMatch(null);
      onMatchUpdated();
    }
  }

  function toggleBanSelection(participantId: string) {
    const newSet = new Set(selectedToBan);
    if (newSet.has(participantId)) {
      newSet.delete(participantId);
    } else {
      newSet.add(participantId);
    }
    setSelectedToBan(newSet);
  }

  async function handleBanSelected() {
    if (selectedToBan.size === 0) return;
    setProcessing(true);
    const result = await banParticipants(league.id, Array.from(selectedToBan));
    setProcessing(false);
    
    if (result) {
      setShowBanModal(false);
      setSelectedToBan(new Set());
      await loadEligibleForBan();
      onMatchUpdated();
    }
  }

  async function handleBanAllEligible() {
    if (eligibleForBan.length === 0) return;
    setProcessing(true);
    const allIds = eligibleForBan.map(p => p.participantId);
    const result = await banParticipants(league.id, allIds);
    setProcessing(false);
    
    if (result) {
      await loadEligibleForBan();
      onMatchUpdated();
    }
  }

  return (
    <div className="pending-tab">
      {/* Ban Warning */}
      {banWarning && (
        <div className="ban-warning-banner card">
          <div className="ban-warning-content">
            <i className="fas fa-exclamation-triangle" />
            <div>
              <strong>{banWarning.alias || banWarning.name}</strong> has reached {banWarning.noShowCount} no-shows and is eligible for ban.
            </div>
          </div>
          <div className="ban-warning-actions">
            <button className="btn-outline btn-sm" onClick={() => setBanWarning(null)}>
              Keep in League
            </button>
            <button
              className="btn-danger btn-sm"
              onClick={async () => {
                await banParticipants(league.id, [banWarning.participantId]);
                setBanWarning(null);
                await loadEligibleForBan();
                onMatchUpdated();
              }}
            >
              Ban Player
            </button>
          </div>
        </div>
      )}

      {/* Eligible for Ban Banner */}
      {eligibleForBan.length > 0 && (
        <div className="eligible-banner card">
          <div className="eligible-content">
            <i className="fas fa-user-times" />
            <div>
              <strong>{eligibleForBan.length} player{eligibleForBan.length > 1 ? 's' : ''}</strong> eligible for ban
            </div>
          </div>
          <div className="eligible-actions">
            <button className="btn-outline btn-sm" onClick={() => setShowBanModal(true)}>
              <i className="fas fa-list" /> View Players
            </button>
            <button className="btn-danger btn-sm" onClick={handleBanAllEligible} disabled={processing}>
              <i className="fas fa-ban" /> Ban All Eligible
            </button>
          </div>
        </div>
      )}

      <div className="pending-header card">
        <div>
          <h3>Pending Review</h3>
          <p className="text-secondary">
            Matches that passed the grace period ({league.gracePeriodDays} days) without being reported.
            You can mark the absent player or cancel the match.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={handleExpireMatches}
          disabled={expiring}
        >
          <i className="fas fa-sync" /> {expiring ? 'Checking...' : 'Check for Expired Matches'}
        </button>
      </div>

      {pendingReviewMatches.length === 0 ? (
        <div className="empty-state card">
          <i className="fas fa-check-circle" style={{ fontSize: '3rem', color: 'var(--primary-color)', marginBottom: '1rem' }} />
          <h3>No matches pending review</h3>
          <p className="text-secondary">All matches are either scheduled, completed, or within the grace period.</p>
        </div>
      ) : (
        <div className="pending-matches-list">
          {pendingReviewMatches.map(match => {
            const weekStart = new Date(league.weekStartDates[match.week]);
            const graceEnd = new Date(weekStart.getTime() + (league.periodDays + league.gracePeriodDays) * 24 * 60 * 60 * 1000);

            return (
              <div key={match.id} className="pending-match-card card">
                <div className="pending-match-info">
                  <div className="pending-match-week">
                    <i className="fas fa-calendar" /> Week {match.week} • Round {match.round}
                  </div>
                  <div className="pending-match-players">
                    <ParticipantName
                      id={match.participant1Id}
                      name={getParticipantName(match.participant1Id)}
                      className="pending-player-name"
                    />
                    <span className="pending-vs">vs</span>
                    <ParticipantName
                      id={match.participant2Id}
                      name={getParticipantName(match.participant2Id)}
                      className="pending-player-name"
                    />
                  </div>
                  <div className="pending-match-meta">
                    <span className="pending-expired-date">
                      <i className="fas fa-hourglass-end" /> Expired: {graceEnd.toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="pending-match-actions">
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => openNoShowModal(match)}
                  >
                    <i className="fas fa-user-times" /> Mark No-Show
                  </button>
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => openCancelModal(match)}
                  >
                    <i className="fas fa-ban" /> Cancel Match
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNoShowModal && selectedMatch && (
        <div className="modal-overlay" onClick={() => setShowNoShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Mark No-Show</h2>
              <button className="btn-icon" onClick={() => setShowNoShowModal(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <p>Select which player was absent:</p>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    checked={selectedAbsent === selectedMatch.participant1Id}
                    onChange={() => setSelectedAbsent(selectedMatch.participant1Id)}
                  />
                  {getParticipantName(selectedMatch.participant1Id)}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={selectedAbsent === selectedMatch.participant2Id}
                    onChange={() => setSelectedAbsent(selectedMatch.participant2Id)}
                  />
                  {getParticipantName(selectedMatch.participant2Id)}
                </label>
              </div>
              <p className="text-secondary" style={{ marginTop: '1rem' }}>
                The absent player will lose ELO and receive a no-show count.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowNoShowModal(false)} disabled={processing}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleMarkNoShow} disabled={processing}>
                {processing ? 'Processing...' : 'Confirm No-Show'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && selectedMatch && (
        <ConfirmModal
          isOpen={showCancelModal}
          title="Cancel Match"
          message={`Are you sure you want to cancel this match? No ELO changes or penalties will be applied.`}
          onConfirm={handleCancelMatch}
          onCancel={() => setShowCancelModal(false)}
          confirmText="Cancel Match"
          cancelText="Keep Match"
        />
      )}

      {/* Ban Modal */}
      {showBanModal && (
        <div className="modal-overlay" onClick={() => setShowBanModal(false)}>
          <div className="modal-content ban-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Players Eligible for Ban</h2>
              <button className="btn-icon" onClick={() => setShowBanModal(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-secondary">
                These players have reached {league.maxNoShowsBeforeKick} or more no-shows. Select which ones to ban.
              </p>
              <div className="ban-list">
                {eligibleForBan.map(player => (
                  <label key={player.participantId} className="ban-list-item">
                    <input
                      type="checkbox"
                      checked={selectedToBan.has(player.participantId)}
                      onChange={() => toggleBanSelection(player.participantId)}
                    />
                    <div className="ban-player-info">
                      <span className="ban-player-name">{player.alias || player.name}</span>
                      <span className="ban-player-count">
                        {player.noShowCount} no-show{player.noShowCount > 1 ? 's' : ''}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="ban-warning-text">
                <i className="fas fa-exclamation-triangle" />
                Banning players will cancel their future matches and regenerate the schedule with remaining active players.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowBanModal(false)} disabled={processing}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleBanSelected}
                disabled={processing || selectedToBan.size === 0}
              >
                {processing ? 'Banning...' : `Ban Selected (${selectedToBan.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaguePendingTab;
