import { useNavigate } from 'react-router-dom';
import './ParticipantName.css';

interface ParticipantNameProps {
  id: string;
  name: string;
  className?: string;
}

function ParticipantName({ id, name, className = '' }: ParticipantNameProps) {
  const navigate = useNavigate();
  return (
    <span
      className={`participant-link ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/participants/${id}`);
      }}
      title="Ver perfil"
    >
      {name}
    </span>
  );
}

export default ParticipantName;
