import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isServerAvailable, resetServerCache } from '@/services/api/apiClient';
import './OfflineNotice.css';

const POLL_MS = 6000;

/**
 * Shown instead of a generic "no data" message when the API can't be reached
 * and there is nothing cached to display. It re-pings the server while
 * visible; pages reload via useOnReconnect once the server answers.
 */
function OfflineNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const id = setInterval(() => void isServerAvailable(), POLL_MS);
    return () => clearInterval(id);
  }, []);

  function retry() {
    setChecking(true);
    resetServerCache();
    isServerAvailable().finally(() => setChecking(false));
  }

  return (
    <div className={`offline-notice${compact ? ' offline-notice--compact' : ''}`} role="status">
      <i className="fas fa-plug-circle-xmark offline-notice__icon" />
      <div className="offline-notice__text">
        <strong>{t('offline.title')}</strong>
        <span>{t('offline.message')}</span>
      </div>
      <button className="btn-outline btn-sm" onClick={retry} disabled={checking}>
        <i className={`fas ${checking ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} />{' '}
        {t(checking ? 'offline.checking' : 'offline.retry')}
      </button>
    </div>
  );
}

export default OfflineNotice;
