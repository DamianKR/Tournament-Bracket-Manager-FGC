import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from '@/contexts/NotificationContext';
import './PwaUpdatePrompt.css';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

function PwaUpdatePrompt() {
  const { t } = useTranslation();
  const toast = useToast();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL_MS);
    },
    onOfflineReady() {
      toast.success(t('pwa.offlineReady'));
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="pwa-update" role="alert">
      <div className="pwa-update__text">
        <i className="fas fa-arrow-rotate-right" />
        <span>{t('pwa.updateAvailable')}</span>
      </div>
      <div className="pwa-update__actions">
        <button className="btn-primary btn-sm" onClick={() => updateServiceWorker(true)}>
          {t('pwa.update')}
        </button>
        <button className="btn-secondary btn-sm" onClick={() => setNeedRefresh(false)}>
          {t('pwa.later')}
        </button>
      </div>
    </div>
  );
}

export default PwaUpdatePrompt;
