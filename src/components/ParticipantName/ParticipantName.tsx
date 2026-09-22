import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCommunity } from '@/contexts/CommunityContext';
import PlayerDisplay from '@/components/PlayerDisplay/PlayerDisplay';
import './ParticipantName.css';

interface ParticipantNameProps {
  id: string;
  name: string;
  alias?: string | null;
  className?: string;
  /** Game context — opens the profile with ?game= preselected */
  gameId?: string | null;
}

function ParticipantName({ id, name, alias, className = '', gameId }: ParticipantNameProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getPath } = useCommunity();
  return (
    <span
      className={`participant-link ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        navigate(getPath(`participants/${id}${gameId ? `?game=${gameId}` : ''}`));
      }}
      title={t('common.viewProfile')}
    >
      {alias !== undefined ? <PlayerDisplay name={name} alias={alias} size="sm" /> : name}
    </span>
  );
}

export default ParticipantName;
