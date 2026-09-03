import { useTranslation } from 'react-i18next';
import { Participant } from '@/models/types';
import { nextPowerOfTwo, calculateByes } from '@/engine/utils/bracketMath';
import './BracketPreview.css';

interface BracketPreviewProps {
  participants: Participant[];
}

function BracketPreview({ participants }: BracketPreviewProps) {
  const { t } = useTranslation();
  const bracketSize = nextPowerOfTwo(participants.length);
  const byes = calculateByes(participants.length);
  const rounds = Math.log2(bracketSize);

  return (
    <div className="bracket-preview card">
      <div className="preview-stats">
        <div className="stat-item">
          <span className="stat-label">{t('tournament.bracketPreview.participantsLabel')}</span>
          <span className="stat-value">{participants.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('tournament.bracketPreview.bracketSizeLabel')}</span>
          <span className="stat-value">{bracketSize}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('tournament.bracketPreview.byesLabel')}</span>
          <span className="stat-value">{byes}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('tournament.bracketPreview.winnerRoundsLabel')}</span>
          <span className="stat-value">{rounds}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">{t('tournament.bracketPreview.loserRoundsLabel')}</span>
          <span className="stat-value">{rounds > 1 ? 2 * (rounds - 1) : 0}</span>
        </div>
      </div>

      <div className="preview-info">
        <h3>{t('tournament.bracketPreview.structureTitle')}</h3>
        <ul>
          <li>
            {t('tournament.bracketPreview.winnerBracket', { matches: participants.length - 1, rounds })}
          </li>
          <li>
            {t('tournament.bracketPreview.loserBracket', { matches: participants.length - 2, rounds: rounds > 1 ? 2 * (rounds - 1) : 0 })}
          </li>
          <li>
            {t('tournament.bracketPreview.grandFinal')}
          </li>
        </ul>

        {byes > 0 && (
          <div className="preview-note">
            {t('tournament.bracketPreview.byeNote', { count: byes })}
          </div>
        )}
      </div>
    </div>
  );
}

export default BracketPreview;
