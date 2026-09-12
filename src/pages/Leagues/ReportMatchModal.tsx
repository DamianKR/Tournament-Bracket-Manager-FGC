import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { League, LeagueMatch, GlobalParticipant } from '@/models/types';
import type { MatchGame } from '@/models/rankedMatch';
import GameLogEditor from '@/components/GameLogEditor/GameLogEditor';
import { getGame } from '@/data/games';

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
  const { canAdminGame } = useCommunity();
  const canAdminLeague = canAdminGame(league.gameId);
  const [games, setGames] = useState<MatchGame[]>([]);
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

  const score1 = games.filter(g => g.winnerId === match.participant1Id).length;
  const score2 = games.filter(g => g.winnerId === match.participant2Id).length;
  const winnerId = score1 > score2 ? match.participant1Id : score2 > score1 ? match.participant2Id : '';
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

    if (!isNoShow) {
      if (games.length === 0) {
        setError(t('league.reportMatch.errors.noGames', { defaultValue: 'Debes registrar al menos un game.' }));
        return;
      }
      if (!winnerId) {
        setError(t('league.reportMatch.errors.noWinner', { defaultValue: 'Debe haber un ganador.' }));
        return;
      }
      if (score1 < winScore && score2 < winScore) {
        setError(t('league.reportMatch.errors.winThreshold', { count: winScore, total: league.gamesPerMatch }));
        return;
      }
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError('');

    const baseResult = {
      winnerId: isNoShow ? (noShowParticipantId === match.participant1Id ? match.participant2Id : match.participant1Id) : winnerId,
      score: `${score1}-${score2}`,
      isNoShow,
      noShowParticipantId: isNoShow ? noShowParticipantId : undefined,
      games: games.length > 0 ? games : undefined,
    };

    let result = null;
    try {
      if (canAdminLeague && (match.status === 'pending_review' || match.status === 'reported')) {
        result = await resolveLeagueMatch(league.id, match.id, baseResult);
      } else {
        result = await reportMatchResult(league.id, match.id, {
          ...baseResult,
          evidence: evidence || undefined,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('league.reportMatch.errors.submitFailed'));
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }

    submittingRef.current = false;
    setSubmitting(false);

    if (!result) {
      setError(t('league.reportMatch.errors.submitFailed'));
      return;
    }

    onSuccess();
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
            <GameLogEditor
              games={games}
              onChange={setGames}
              playerAId={match.participant1Id}
              playerBId={match.participant2Id}
              playerAName={p1Name}
              playerBName={p2Name}
              gameId={league.gameId}
              characters={getGame(league.gameId)?.characters || []}
            />
          )}

          {!(canAdminLeague && (match.status === 'pending_review' || match.status === 'reported')) && (
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
              : canAdminLeague && match.status === 'pending_review'
                ? t('league.reportMatch.resolve')
                : t('league.reportMatch.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportMatchModal;
