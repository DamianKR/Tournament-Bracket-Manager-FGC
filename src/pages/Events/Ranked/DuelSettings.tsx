import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DuelSettings as DuelSettingsType } from '@/models/duel';
import './DuelSettings.css';

interface DuelSettingsProps {
  settings: DuelSettingsType;
  onUpdate: (settings: DuelSettingsType) => void;
}

function DuelSettings({ settings, onUpdate }: DuelSettingsProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onUpdate(localSettings);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setLocalSettings(settings);
    setIsOpen(false);
  };

  return (
    <>
      <button className="btn-outline btn-sm" onClick={() => setIsOpen(true)}>
        <i className="fas fa-cog" /> {t('ranked.duelInfo.settingsTitle')}
      </button>

      {isOpen && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content duel-settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-cog" /> {t('ranked.duelInfo.settingsTitle')}</h2>
              <button className="btn-icon" onClick={handleCancel}>
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="maxChallenges">
                  {t('ranked.duelInfo.maxChallengesPerWeek')}
                  <span className="text-secondary"> (1–50)</span>
                </label>
                <input
                  id="maxChallenges"
                  type="number"
                  min="1"
                  max="50"
                  value={localSettings.maxChallengesPerWeek}
                  onChange={e => setLocalSettings({
                    ...localSettings,
                    maxChallengesPerWeek: Math.max(1, Math.min(50, parseInt(e.target.value) || 1))
                  })}
                  className="form-control"
                />
                <p className="form-help">
                  {t('ranked.duelInfo.maxChallengesPerWeekHelp')}
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="eloRestriction">
                  {t('ranked.duelInfo.eloRestrictionSetting')}
                  <span className="text-secondary"> ({t('ranked.duelInfo.pointsSuffix')})</span>
                </label>
                <input
                  id="eloRestriction"
                  type="number"
                  min="0"
                  max="1000"
                  step="50"
                  value={localSettings.eloRestriction}
                  onChange={e => setLocalSettings({
                    ...localSettings,
                    eloRestriction: Math.max(0, Math.min(1000, parseInt(e.target.value) || 0))
                  })}
                  className="form-control"
                />
                <p className="form-help">
                  {t('ranked.duelInfo.eloRestrictionHelp')}
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="expiration">
                  {t('ranked.duelInfo.challengeExpiration')}
                  <span className="text-secondary"> ({t('ranked.duelInfo.daysSuffix')})</span>
                </label>
                <input
                  id="expiration"
                  type="number"
                  min="1"
                  max="30"
                  value={localSettings.challengeExpirationDays}
                  onChange={e => setLocalSettings({
                    ...localSettings,
                    challengeExpirationDays: Math.max(1, Math.min(30, parseInt(e.target.value) || 7))
                  })}
                  className="form-control"
                />
                <p className="form-help">
                  {t('ranked.duelInfo.challengeExpirationHelp')}
                </p>
              </div>

              <div className="form-group">
                <div className="form-check">
                  <input
                    id="mandatoryEnabled"
                    type="checkbox"
                    checked={!!localSettings.mandatoryDuelsEnabled}
                    onChange={e => setLocalSettings({
                      ...localSettings,
                      mandatoryDuelsEnabled: e.target.checked
                    })}
                  />
                  <label htmlFor="mandatoryEnabled">
                    {t('ranked.duelInfo.allowMandatoryDuels')}
                  </label>
                </div>
                <p className="form-help">
                  {t('ranked.duelInfo.allowMandatoryDuelsHelp')}
                </p>
              </div>

              {localSettings.mandatoryDuelsEnabled !== false && (
                <div className="form-group">
                  <label htmlFor="mandatoryPerWeek">
                    {t('ranked.duelInfo.mandatoryPerWeek')}
                    <span className="text-secondary"> (0-10)</span>
                  </label>
                  <input
                    id="mandatoryPerWeek"
                    type="number"
                    min="0"
                    max="10"
                    value={localSettings.mandatoryDuelsPerWeek ?? 1}
                    onChange={e => setLocalSettings({
                      ...localSettings,
                      mandatoryDuelsPerWeek: Math.max(0, Math.min(10, parseInt(e.target.value) || 0))
                    })}
                    className="form-control"
                  />
                  <p className="form-help">
                    {t('ranked.duelInfo.mandatoryPerWeekHelp')}
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-outline" onClick={handleCancel}>
                {t('ranked.duelInfo.cancel')}
              </button>
              <button className="btn-primary" onClick={handleSave}>
                <i className="fas fa-save" /> {t('ranked.duelInfo.saveSettings')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DuelSettings;
