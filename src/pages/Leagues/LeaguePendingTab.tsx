import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    return p ? (p.alias?.trim() || p.name) : t('tournament.bracket.unknown');
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
              {t('league.pending.banWarning', { name: banWarning.alias || banWarning.name, count: banWarning.noShowCount })}
            </div>
          </div>
          <div className="ban-warning-actions">
            <button className="btn-outline btn-sm" onClick={() => setBanWarning(null)}>
              {t('league.pending.keepInLeague')}
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
              {t('league.pending.banPlayer')}
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
              {t('league.pending.eligibleBanner', { count: eligibleForBan.length })}
            </div>
          </div>
          <div className="eligible-actions">
            <button className="btn-outline btn-sm" onClick={() => setShowBanModal(true)}>
              <i className="fas fa-list" /> {t('league.pending.viewPlayers')}
            </button>
            <button className="btn-danger btn-sm" onClick={handleBanAllEligible} disabled={processing}>
              <i className="fas fa-ban" /> {t('league.pending.banAllEligible')}
            </button>
          </div>
        </div>
      )}

      <div className="pending-header card">
        <div>
          <h3>{t('league.pending.title')}</h3>
          <p className="text-secondary">
            {t('league.pending.description', { days: league.gracePeriodDays })}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={handleExpireMatches}
          disabled={expiring}
        >
          <i className="fas fa-sync" /> {expiring ? t('league.pending.checking') : t('league.pending.checkExpired')}
        </button>
      </div>

      {pendingReviewMatches.length === 0 ? (
        <div className="empty-state card">
          <i className="fas fa-check-circle" style={{ fontSize: '3rem', color: 'var(--primary-color)', marginBottom: '1rem' }} />
          <h3>{t('league.pending.emptyTitle')}</h3>
          <p className="text-secondary">{t('league.pending.emptyDesc')}</p>
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
                    <i className="fas fa-calendar" /> {t('league.pending.matchWeekRound', { week: match.week, round: match.round })}
                  </div>
                  <div className="pending-match-players">
                    <ParticipantName
                      id={match.participant1Id}
                      name={getParticipantName(match.participant1Id)}
                      className="pending-player-name"
                    />
                    <span className="pending-vs">{t('league.schedule.vs')}</span>
                    <ParticipantName
                      id={match.participant2Id}
                      name={getParticipantName(match.participant2Id)}
                      className="pending-player-name"
                    />
                  </div>
                  <div className="pending-match-meta">
                    <span className="pending-expired-date">
                      <i className="fas fa-hourglass-end" /> {t('league.pending.expired', { date: graceEnd.toLocaleDateString() })}
                    </span>
                  </div>
                </div>
                <div className="pending-match-actions">
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => openNoShowModal(match)}
                  >
                    <i className="fas fa-user-times" /> {t('league.pending.markNoShow')}
                  </button>
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => openCancelModal(match)}
                  >
                    <i className="fas fa-ban" /> {t('league.pending.cancelMatch')}
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
              <h2>{t('league.pending.noShowModal.title')}</h2>
              <button className="btn-icon" onClick={() => setShowNoShowModal(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <p>{t('league.pending.noShowModal.description')}</p>
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
                {t('league.pending.noShowModal.absentHint')}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowNoShowModal(false)} disabled={processing}>
                {t('league.pending.noShowModal.cancel')}
              </button>
              <button className="btn-danger" onClick={handleMarkNoShow} disabled={processing}>
                {processing ? t('league.pending.noShowModal.processing') : t('league.pending.noShowModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && selectedMatch && (
        <ConfirmModal
          isOpen={showCancelModal}
          title={t('league.pending.cancelConfirm.title')}
          message={t('league.pending.cancelConfirm.message')}
          onConfirm={handleCancelMatch}
          onCancel={() => setShowCancelModal(false)}
          confirmText={t('league.pending.cancelConfirm.confirm')}
          cancelText={t('league.pending.cancelConfirm.cancel')}
        />
      )}

      {/* Ban Modal */}
      {showBanModal && (
        <div className="modal-overlay" onClick={() => setShowBanModal(false)}>
          <div className="modal-content ban-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('league.pending.banModal.title')}</h2>
              <button className="btn-icon" onClick={() => setShowBanModal(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-secondary">
                {t('league.pending.banModal.description', { max: league.maxNoShowsBeforeKick })}
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
                        {t('league.pending.banModal.noShowCount', { count: player.noShowCount })}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="ban-warning-text">
                <i className="fas fa-exclamation-triangle" />
                {t('league.pending.banModal.warning')}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowBanModal(false)} disabled={processing}>
                {t('league.pending.banModal.cancel')}
              </button>
              <button
                className="btn-danger"
                onClick={handleBanSelected}
                disabled={processing || selectedToBan.size === 0}
              >
                {processing ? t('league.pending.banModal.banning') : t('league.pending.banModal.banSelected', { count: selectedToBan.size })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaguePendingTab;
