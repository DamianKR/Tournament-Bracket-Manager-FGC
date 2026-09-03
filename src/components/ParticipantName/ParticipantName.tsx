import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCommunity } from '@/contexts/CommunityContext';
import './ParticipantName.css';

interface ParticipantNameProps {
  id: string;
  name: string;
  className?: string;
}

function ParticipantName({ id, name, className = '' }: ParticipantNameProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getPath } = useCommunity();
  return (
    <span
      className={`participant-link ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        navigate(getPath(`participants/${id}`));
      }}
      title={t('common.viewProfile')}
    >
      {name}
    </span>
  );
}

export default ParticipantName;
