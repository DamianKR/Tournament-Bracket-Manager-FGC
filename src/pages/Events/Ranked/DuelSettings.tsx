import { useState, useEffect } from 'react';
import { DuelSettings as DuelSettingsType } from '@/models/duel';
import './DuelSettings.css';

interface DuelSettingsProps {
  settings: DuelSettingsType;
  onUpdate: (settings: DuelSettingsType) => void;
}

function DuelSettings({ settings, onUpdate }: DuelSettingsProps) {
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
        <i className="fas fa-cog" /> Duel Settings
      </button>

      {isOpen && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content duel-settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-cog" /> Duel Settings</h2>
              <button className="btn-icon" onClick={handleCancel}>
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="maxChallenges">
                  Max Challenges Per Week
                  <span className="text-secondary"> (1-50)</span>
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
                  Maximum number of duel challenges a player can create per week
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="eloRestriction">
                  ELO Restriction
                  <span className="text-secondary"> (points)</span>
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
                  Players cannot challenge opponents this many ELO points below them.
                  Prevents high-ranked players from farming low-ranked players.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="expiration">
                  Challenge Expiration
                  <span className="text-secondary"> (days)</span>
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
                  Number of days before an unaccepted challenge expires
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-outline" onClick={handleCancel}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSave}>
                <i className="fas fa-save" /> Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DuelSettings;
