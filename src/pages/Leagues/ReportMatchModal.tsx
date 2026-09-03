import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { League, LeagueMatch, GlobalParticipant } from '@/models/types';

import { useCommunity } from '@/contexts/CommunityContext';
import { reportMatchResult, resolveLeagueMatch } from '@/services/leagues/leagueService';
import './ReportMatchModal.css';

interface ReportMatchModalProps {
  league: League;
  match: LeagueMatch;
  participants: Map<string, GlobalParticipant>;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_EVIDENCE_SIZE_MB = 4;
const MAX_EVIDENCE_SIZE_BYTES = MAX_EVIDENCE_SIZE_MB * 1024 * 1024;

function ReportMatchModal({ league, match, participants, onClose, onSuccess }: ReportMatchModalProps) {
  const { t } = useTranslation();
  const { canAdminCurrentCommunity } = useCommunity();
  const [winnerId, setWinnerId] = useState(match.participant1Id);
  const [score1, setScore1] = useState(2);
  const [score2, setScore2] = useState(0);
  const [isNoShow, setIsNoShow] = useState(false);
  const [noShowParticipantId, setNoShowParticipantId] = useState(match.participant1Id);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  const p1 = participants.get(match.participant1Id);
  const p2 = participants.get(match.participant2Id);
  const p1Name = p1 ? (p1.alias?.trim() || p1.name) : t('tournament.bracket.unknown');
  const p2Name = p2 ? (p2.alias?.trim() || p2.name) : t('tournament.bracket.unknown');

  const winScore = Math.ceil(league.gamesPerMatch / 2);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
      setError(t('league.reportMatch.errors.imageTooLarge', { size: MAX_EVIDENCE_SIZE_MB }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setEvidence(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (submittingRef.current) {
      console.log('[ReportMatchModal] Already submitting, ignoring duplicate click');
      return;
    }

    if (!isNoShow && (score1 < winScore && score2 < winScore)) {
      setError(t('league.reportMatch.errors.winThreshold', { count: winScore, total: league.gamesPerMatch }));
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError('');

    const baseResult = {
      winnerId: isNoShow ? (noShowParticipantId === match.participant1Id ? match.participant2Id : match.participant1Id) : winnerId,
      score: `${score1}-${score2}`,
      isNoShow,
      noShowParticipantId: isNoShow ? noShowParticipantId : undefined,
    };

    let result = null;
    if (canAdminCurrentCommunity && (match.status === 'pending_review' || match.status === 'reported')) {
      result = await resolveLeagueMatch(league.id, match.id, baseResult);
    } else {
      result = await reportMatchResult(league.id, match.id, {
        ...baseResult,
        evidence: evidence || undefined,
      });
    }

    submittingRef.current = false;
    setSubmitting(false);

    if (!result) {
      setError(t('league.reportMatch.errors.submitFailed'));
      return;
    }

    onSuccess();
  }

  function handleScoreChange(player: 1 | 2, value: number) {
    if (player === 1) {
      setScore1(value);
      if (value === winScore) {
        setScore2(Math.min(score2, winScore - 1));
        setWinnerId(match.participant1Id);
      } else if (score2 === winScore && value > score2) {
        // If p2 was already at winning score, p1 can't pass it
        setScore1(Math.min(value, score2 - 1));
      }
    } else {
      setScore2(value);
      if (value === winScore) {
        setScore1(Math.min(score1, winScore - 1));
        setWinnerId(match.participant2Id);
      } else if (score1 === winScore && value > score1) {
        setScore2(Math.min(value, score1 - 1));
      }
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content report-match-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('league.reportMatch.title')}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="match-info">
            <div className="match-info-players">
              <span className="match-info-player">{p1Name}</span>
              <span className="match-info-vs">{t('league.schedule.vs')}</span>
              <span className="match-info-player">{p2Name}</span>
            </div>
            <div className="match-info-meta">
              {t('league.reportMatch.weekRound', { week: match.week, round: match.round })}
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          {match.reportedResults && match.reportedResults.length > 0 && (
            <div className="reported-results">
              <h4>{t('league.reportMatch.previousReports')}</h4>
              {match.reportedResults.map((r) => {
                const reporter = participants.get(r.participantId);
                const winner = participants.get(r.winnerId);
                const reporterName = reporter?.alias?.trim() || reporter?.name || t('tournament.bracket.unknown');
                const winnerName = winner?.alias?.trim() || winner?.name || t('tournament.bracket.unknown');
                const suffix = (r.isNoShow ? t('league.reportMatch.noShowSuffix') : '') + (r.evidence ? t('league.reportMatch.withEvidenceSuffix') : '');
                return (
                  <div key={r.participantId} className="reported-result">
                    {t('league.reportMatch.reportedEntry', { reporter: reporterName, winner: winnerName, score: r.score, suffix })}
                  </div>
                );
              })}
            </div>
          )}

          <div className="form-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isNoShow}
                onChange={(e) => setIsNoShow(e.target.checked)}
              />
              {t('league.reportMatch.markNoShow')}
            </label>
          </div>

          {isNoShow ? (
            <div className="form-section">
              <label>{t('league.reportMatch.absentPlayer')}</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    checked={noShowParticipantId === match.participant1Id}
                    onChange={() => setNoShowParticipantId(match.participant1Id)}
                  />
                  {p1Name}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={noShowParticipantId === match.participant2Id}
                    onChange={() => setNoShowParticipantId(match.participant2Id)}
                  />
                  {p2Name}
                </label>
              </div>
              <p className="form-hint">
                {t('league.reportMatch.absentHint')}
              </p>
            </div>
          ) : (
            <>
              <div className="form-section">
                <label>{t('league.reportMatch.winner')}</label>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      checked={winnerId === match.participant1Id}
                      onChange={() => setWinnerId(match.participant1Id)}
                    />
                    {p1Name}
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={winnerId === match.participant2Id}
                      onChange={() => setWinnerId(match.participant2Id)}
                    />
                    {p2Name}
                  </label>
                </div>
              </div>

              <div className="form-section">
                <label>{t('league.reportMatch.scoreLabel', { count: league.gamesPerMatch })}</label>
                <div className="score-inputs">
                  <div className="score-input-group">
                    <span className="score-player-name">{p1Name}</span>
                    <select value={score1} onChange={(e) => handleScoreChange(1, Number(e.target.value))}>
                      {Array.from({ length: winScore + 1 }, (_, i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                  <span className="score-separator">-</span>
                  <div className="score-input-group">
                    <span className="score-player-name">{p2Name}</span>
                    <select value={score2} onChange={(e) => handleScoreChange(2, Number(e.target.value))}>
                      {Array.from({ length: winScore + 1 }, (_, i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {!(canAdminCurrentCommunity && (match.status === 'pending_review' || match.status === 'reported')) && (
            <div className="form-section">
              <label>{t('league.reportMatch.evidenceLabel', { size: MAX_EVIDENCE_SIZE_MB })}</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
              />
              {evidence && <div className="evidence-preview"><img src={evidence} alt={t('league.reportMatch.evidenceLabel')} /></div>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose} disabled={submitting}>
            {t('league.reportMatch.cancel')}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? t('league.reportMatch.submitting')
              : canAdminCurrentCommunity && match.status === 'pending_review'
                ? t('league.reportMatch.resolve')
                : t('league.reportMatch.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportMatchModal;
