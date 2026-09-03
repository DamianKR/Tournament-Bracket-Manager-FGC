import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DuelSettings, DEFAULT_DUEL_SETTINGS } from '@/models/duel';
import { getDuelSettingsAsync, getNextWeeklyReset, formatTimeUntilReset } from '@/services/duels/duelService';
import { useCommunity } from '@/contexts/CommunityContext';
import './DuelInfo.css';

function DuelInfo() {
  const { t } = useTranslation();
  const { currentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;
  const [settings, setSettings] = useState<DuelSettings>(DEFAULT_DUEL_SETTINGS);
  const [nextResetText, setNextResetText] = useState('');

  useEffect(() => {
    loadSettings();
  }, [communityId]);

  const loadSettings = async () => {
    if (!communityId) return;
    const currentSettings = await getDuelSettingsAsync(communityId);
    setSettings(currentSettings);
    const nextReset = getNextWeeklyReset(currentSettings);
    setNextResetText(formatTimeUntilReset(nextReset));
  };

  const dayNames = t('common.days', { returnObjects: true }) as string[];
  const resetDayName = dayNames[settings.weeklyResetDay] ?? dayNames[1];
  const resetTime = `${String(settings.weeklyResetHour).padStart(2, '0')}:${String(settings.weeklyResetMinute).padStart(2, '0')}`;

  return (
    <div className="duel-info card">
      <h2><i className="fas fa-info-circle" /> {t('ranked.duelInfo.title')}</h2>

      <section className="duel-info-section">
        <h3><i className="fas fa-bolt" /> {t('ranked.duelInfo.whatAreDuels')}</h3>
        <p>{t('ranked.duelInfo.whatAreDuelsDesc')}</p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-fire" /> {t('ranked.duelInfo.weeklyLimit')}</h3>
        <p>
          {t('ranked.duelInfo.weeklyLimitDesc', { max: settings.maxChallengesPerWeek, day: resetDayName, time: resetTime })}
        </p>
        {nextResetText && (
          <p className="duel-info-highlight">
            <i className="fas fa-clock" /> {t('ranked.duelInfo.nextReset', { time: nextResetText })}
          </p>
        )}
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-balance-scale" /> {t('ranked.duelInfo.eloRestriction')}</h3>
        <p>
          {t('ranked.duelInfo.eloRestrictionDesc', { restriction: settings.eloRestriction })}
        </p>
        <p className="duel-info-example">
          {t('ranked.duelInfo.eloRestrictionExample', { min: 1700 - settings.eloRestriction })}
        </p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-hourglass-half" /> {t('ranked.duelInfo.expiration')}</h3>
        <p>
          {t('ranked.duelInfo.expirationDesc', { days: settings.challengeExpirationDays })}
        </p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-shield-alt" /> {t('ranked.duelInfo.noRepeat')}</h3>
        <p>{t('ranked.duelInfo.noRepeatDesc')}</p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-trophy" /> {t('ranked.duelInfo.eloPoints')}</h3>
        <p>{t('ranked.duelInfo.eloPointsDesc')}</p>
      </section>
    </div>
  );
}

export default DuelInfo;
