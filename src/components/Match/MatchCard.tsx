import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Match } from '@/models/types';
import type { MatchGame } from '@/models/rankedMatch';
import { getCharacterIconUrl } from '@/utils/characterImage';
import { charsWithColorsFromGames } from '@/utils/matchData';
import MatchResultModal from './MatchResultModal';
import './MatchCard.css';

interface MatchCardProps {
  match: Match;
  participant1Name: string;
  participant2Name: string;
  gameId?: string;
  onSelectWinner?: (matchId: string, winnerId: string, score1?: number, score2?: number, chars1?: string[], chars2?: string[]) => void;
  onSelectGames?: (matchId: string, winnerId: string, games: MatchGame[]) => void;
  onRevertMatch?: (matchId: string) => void;
  readOnly?: boolean;
  isGrandFinal?: boolean;
  reversible?: boolean;
}

function MatchCard({
  match,
  participant1Name,
  participant2Name,
  gameId,
  onSelectWinner,
  onSelectGames,
  onRevertMatch,
  readOnly = false,
  isGrandFinal = false,
  reversible = false,
}: MatchCardProps) {
  const { t } = useTranslation();
  const [showDetailModal, setShowDetailModal] = useState(false);

  const canSelect = !readOnly && match.participant1Id && match.participant2Id && match.status !== 'completed';
  const canView = match.status === 'completed' && match.participant1Id && match.participant2Id;

  const handleClickParticipant = (participantId: string | null) => {
    if (!participantId) return;
    // Open modal for reporting (pending) or viewing (completed)
    setShowDetailModal(true);
  };

  const handleDetailedConfirm = (winnerId: string, score1: number, score2: number, chars1?: string[], chars2?: string[]) => {
    if (!onSelectWinner) return;
    onSelectWinner(match.id, winnerId, score1, score2, chars1, chars2);
    setShowDetailModal(false);
  };

  const handleDetailedConfirmGames = (winnerId: string, games: MatchGame[]) => {
    if (!onSelectGames) return;
    onSelectGames(match.id, winnerId, games);
    setShowDetailModal(false);
  };

  const isWinner   = (id: string | null) => match.winnerId === id;
  const isLoser    = (id: string | null) => match.loserId === id;

  const isGhostMatch = match.status === 'completed' &&
    !match.participant1Id && !match.participant2Id && !match.winnerId;

  const hasScore = match.participant1Score !== undefined || match.participant2Score !== undefined;
  const hasGames = match.games && match.games.length > 0;

  const p1GameChars = hasGames
    ? charsWithColorsFromGames(match.games, 1)
    : (match.participant1Characters ?? []);
  const p2GameChars = hasGames
    ? charsWithColorsFromGames(match.games, 2)
    : (match.participant2Characters ?? []);

  return (
    <div className={`match-card ${isGrandFinal ? 'grand-final-match' : ''} ${isGhostMatch ? 'ghost-match' : ''}`}>

      {/* Left column: match id + status — also opens the modal */}
      <div
        className={`match-header ${(canSelect || canView) ? 'clickable' : ''}`}
        onClick={() => { if (canSelect || canView) setShowDetailModal(true); }}
      >
        <span className="match-id">{t('tournament.matchCard.match', { number: match.matchNumber })}</span>
        {match.status === 'completed' && !isGhostMatch && (
          <span className="match-status completed"><i className="fas fa-check" /></span>
        )}
        {isGhostMatch && (
          <span className="match-status ghost">{t('tournament.matchCard.autoBye')}</span>
        )}
        {match.status === 'pending' && (!match.participant1Id || !match.participant2Id) && (
          <span className="match-status pending">{t('tournament.matchCard.waiting')}</span>
        )}
      </div>

      {/* Right column */}
      <div className="match-body">
        <div className="match-participants">
          {/* Participant 1 */}
          <div
            className={`participant
              ${isWinner(match.participant1Id) ? 'winner' : ''}
              ${isLoser(match.participant1Id) ? 'loser' : ''}
              ${(canSelect || canView) && match.participant1Id ? 'selectable' : ''}`}
            onClick={() => handleClickParticipant(match.participant1Id)}
          >
            <div className="participant-left">
              {p1GameChars.length > 0 && gameId && (
                <div className="character-icons">
                  {p1GameChars.slice(0, 3).map((item, idx) => {
                    const charId = typeof item === 'string' ? item : item.id;
                    const color = typeof item === 'string' ? undefined : item.color;
                    return (
                      <img
                        key={idx}
                        src={getCharacterIconUrl(gameId, charId, color) ?? ''}
                        alt=""
                        className="participant-character-icon"
                        title={charId}
                      />
                    );
                  })}
                  {p1GameChars.length > 3 && (
                    <span className="more-characters">+{p1GameChars.length - 3}</span>
                  )}
                </div>
              )}
              <span className="participant-name">{participant1Name}</span>
            </div>
            <div className="participant-right">
              {hasScore && <span className="participant-score">{match.participant1Score ?? 0}</span>}
              {isWinner(match.participant1Id) && !hasScore && <span className="winner-badge">{t('tournament.matchCard.winnerBadge')}</span>}
            </div>
          </div>

          <div className="match-divider">{t('tournament.matchCard.vs')}</div>

          {/* Participant 2 */}
          <div
            className={`participant
              ${isWinner(match.participant2Id) ? 'winner' : ''}
              ${isLoser(match.participant2Id) ? 'loser' : ''}
              ${(canSelect || canView) && match.participant2Id ? 'selectable' : ''}`}
            onClick={() => handleClickParticipant(match.participant2Id)}
          >
            <div className="participant-left">
              {p2GameChars.length > 0 && gameId && (
                <div className="character-icons">
                  {p2GameChars.slice(0, 3).map((item, idx) => {
                    const charId = typeof item === 'string' ? item : item.id;
                    const color = typeof item === 'string' ? undefined : item.color;
                    return (
                      <img
                        key={idx}
                        src={getCharacterIconUrl(gameId, charId, color) ?? ''}
                        alt=""
                        className="participant-character-icon"
                        title={charId}
                      />
                    );
                  })}
                  {p2GameChars.length > 3 && (
                    <span className="more-characters">+{p2GameChars.length - 3}</span>
                  )}
                </div>
              )}
              <span className="participant-name">{participant2Name}</span>
            </div>
            <div className="participant-right">
              {hasScore && <span className="participant-score">{match.participant2Score ?? 0}</span>}
              {isWinner(match.participant2Id) && !hasScore && <span className="winner-badge">{t('tournament.matchCard.winnerBadge')}</span>}
            </div>
          </div>
        </div>

      </div>

      {/* Detailed result modal */}
      {showDetailModal && (canSelect || canView) && (
        <MatchResultModal
          match={match}
          participant1Name={participant1Name}
          participant2Name={participant2Name}
          gameId={gameId}
          onConfirm={handleDetailedConfirm}
          onConfirmGames={onSelectGames ? handleDetailedConfirmGames : undefined}
          onCancel={() => setShowDetailModal(false)}
          onRevert={reversible && onRevertMatch ? () => {
            onRevertMatch(match.id);
            setShowDetailModal(false);
          } : undefined}
          readOnly={!canSelect}
        />
      )}
    </div>
  );
}

export default MatchCard;
