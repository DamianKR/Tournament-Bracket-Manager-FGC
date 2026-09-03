import { useTranslation } from 'react-i18next';
import './Loading.css';

interface LoadingProps {
  message?: string;
}

function Loading({ message }: LoadingProps) {
  const { t } = useTranslation();
  const displayMessage = message ?? t('common.loading');
  return (
    <div className="loading-state">
      <i className="fas fa-circle-notch fa-spin loading-icon" />
      <span className="loading-text">{displayMessage}</span>
    </div>
  );
}

export default Loading;
