/**
 * Modal para reportar/ver resultados de matches de torneos
 * Wrapper del componente genérico MatchDetailModal
 */
import { Match } from '@/models/types';
import MatchDetailModal, { MatchDetailData } from './MatchDetailModal';

interface MatchResultModalProps {
  match: Match;
  participant1Name: string;
  participant2Name: string;
  gameId?: string;
  onConfirm: (winnerId: string, score1: number, score2: number, chars1?: string[], chars2?: string[]) => void;
  onCancel: () => void;
  onRevert?: () => void;
  readOnly?: boolean;
}

function MatchResultModal({
  match,
  participant1Name,
  participant2Name,
  gameId,
  onConfirm,
  onCancel,
  onRevert,
  readOnly = false,
}: MatchResultModalProps) {
  const data: MatchDetailData = {
    participant1Name,
    participant2Name,
    participant1Score: match.participant1Score,
    participant2Score: match.participant2Score,
    participant1Characters: match.participant1Characters,
    participant2Characters: match.participant2Characters,
    winnerId: match.winnerId,
  };

  return (
    <MatchDetailModal
      participant1Id={match.participant1Id ?? ''}
      participant2Id={match.participant2Id ?? ''}
      data={data}
      gameId={gameId}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onRevert={onRevert}
      readOnly={readOnly}
    />
  );
}

export default MatchResultModal;
