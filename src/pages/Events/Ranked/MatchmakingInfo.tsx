import { useTranslation } from 'react-i18next';
import './DuelInfo.css';

function MatchmakingInfo() {
  const { t } = useTranslation();

  return (
    <div className="duel-info card">
      <h2><i className="fas fa-info-circle" /> {t('ranked.mm.infoTab.title')}</h2>

      <section className="duel-info-section">
        <h3><i className="fas fa-shuffle" /> {t('ranked.mm.infoTab.whatIs')}</h3>
        <p>{t('ranked.mm.infoTab.whatIsDesc')}</p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-calendar-week" /> {t('ranked.mm.infoTab.periods')}</h3>
        <p>{t('ranked.mm.infoTab.periodsDesc')}</p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-user-check" /> {t('ranked.mm.infoTab.availability')}</h3>
        <p>{t('ranked.mm.infoTab.availabilityDesc')}</p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-swords" /> {t('ranked.mm.infoTab.mandatory')}</h3>
        <p>{t('ranked.mm.infoTab.mandatoryDesc')}</p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-hourglass-half" /> {t('ranked.mm.infoTab.grace')}</h3>
        <p>{t('ranked.mm.infoTab.graceDesc')}</p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-flag-checkered" /> {t('ranked.mm.infoTab.duration')}</h3>
        <p>{t('ranked.mm.infoTab.durationDesc')}</p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-user-slash" /> {t('ranked.mm.infoTab.removal')}</h3>
        <p>{t('ranked.mm.infoTab.removalDesc')}</p>
      </section>
    </div>
  );
}

export default MatchmakingInfo;
