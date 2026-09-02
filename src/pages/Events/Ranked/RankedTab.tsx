import { useState, useEffect } from 'react';
import { RankedMatchType } from '@/models/types';
import { DuelSettings as DuelSettingsType, DEFAULT_DUEL_SETTINGS } from '@/models/duel';
import { getDuelSettingsAsync, updateDuelSettings } from '@/services/duels/duelService';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import DuelSettings from './DuelSettings';
import RecordMatchTab from './RecordMatchTab';
import ActiveChallenges from './ActiveChallenges';
import DuelInfo from './DuelInfo';
import './RankedTab.css';

type RankedSubTab = 'record' | 'challenges' | 'info';

function RankedTab() {
  const { user, isAdmin } = useAuth();
  const { currentCommunity } = useCommunity();
  const communityId = currentCommunity?.id;
  const [matchType, setMatchType] = useState<RankedMatchType>('duel');
  const [subTab, setSubTab] = useState<RankedSubTab>('challenges');
  const [settings, setSettings] = useState<DuelSettingsType>(DEFAULT_DUEL_SETTINGS);
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, [communityId]);

  const loadSettings = async () => {
    if (!communityId) return;
    const currentSettings = await getDuelSettingsAsync(communityId);
    setSettings(currentSettings);
  };

  const handleUpdateSettings = async (newSettings: DuelSettingsType) => {
    if (!communityId) return;
    await updateDuelSettings(newSettings, communityId);
    setSettings(newSettings);
  };

  const handleChallengeSelect = (challenge: { id: string; challengerId: string; challengedId: string }) => {
    // Allow admin or challenge participants to access record tab
    const isParticipant = user?.participantId === challenge.challengerId || user?.participantId === challenge.challengedId;
    if (!isAdmin && !isParticipant) return;
    setSelectedChallenge(challenge.id);
    setSubTab('record');
  };

  return (
    <div className="ranked-tab">
      <div className="ranked-header">
        <div>
          <h1><i className="fas fa-star" /> Ranked Matches</h1>
          <p className="text-secondary">Record and track competitive ranked matches</p>
        </div>
        <div className="ranked-actions">
          <select
            value={matchType}
            onChange={e => setMatchType(e.target.value as RankedMatchType)}
            className="match-type-select"
          >
            <option value="duel">Duels</option>
            <option value="matchmaking" disabled>Matchmaking (Coming Soon)</option>
          </select>
          {matchType === 'duel' && isAdmin && (
            <DuelSettings settings={settings} onUpdate={handleUpdateSettings} />
          )}
        </div>
      </div>

      {matchType === 'duel' && (
        <>
          <div className="ranked-tabs">
            <button
              className={`ranked-tab-btn ${subTab === 'challenges' ? 'active' : ''}`}
              onClick={() => { setSubTab('challenges'); setSelectedChallenge(null); }}
            >
              <i className="fas fa-swords" /> Manage Challenges
            </button>
            {(isAdmin || selectedChallenge) && (
              <button
                className={`ranked-tab-btn ${subTab === 'record' ? 'active' : ''}`}
                onClick={() => setSubTab('record')}
              >
                <i className="fas fa-gamepad" /> {selectedChallenge ? 'Report Result' : 'Record Match'}
              </button>
            )}
            <button
              className={`ranked-tab-btn ${subTab === 'info' ? 'active' : ''}`}
              onClick={() => setSubTab('info')}
            >
              <i className="fas fa-info-circle" /> Info
            </button>
          </div>

          <div className="ranked-content">
            {subTab === 'challenges' && (
              <ActiveChallenges onChallengeSelect={handleChallengeSelect} />
            )}
            {subTab === 'record' && (isAdmin || selectedChallenge) && (
              <RecordMatchTab
                matchType={matchType}
                selectedChallengeId={selectedChallenge}
                onMatchRecorded={() => {
                  setSelectedChallenge(null);
                  setSubTab('challenges');
                }}
              />
            )}
            {subTab === 'info' && <DuelInfo />}
          </div>
        </>
      )}

      {matchType === 'matchmaking' && (
        <div className="coming-soon card">
          <i className="fas fa-hammer" style={{ fontSize: '3rem', color: 'var(--primary-color)', marginBottom: '1rem' }} />
          <h2>Matchmaking Coming Soon</h2>
          <p className="text-secondary">
            Automated matchmaking system is under development.
          </p>
        </div>
      )}
    </div>
  );
}

export default RankedTab;
