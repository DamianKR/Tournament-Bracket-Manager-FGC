import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RankedMatchType } from '@/models/types';
import { DuelSettings as DuelSettingsType, DEFAULT_DUEL_SETTINGS } from '@/models/duel';
import { getDuelSettingsAsync, updateDuelSettings } from '@/services/duels/duelService';
import { useCommunity } from '@/contexts/CommunityContext';
import DuelSettings from './DuelSettings';
import RecordMatchTab from './RecordMatchTab';
import ActiveChallenges from './ActiveChallenges';
import DuelInfo from './DuelInfo';
import MatchmakingTab from './MatchmakingTab';
import MatchmakingInfo from './MatchmakingInfo';
import { MatchmakingAssignment } from '@/services/matchmaking/matchmakingService';
import './RankedTab.css';

type RankedSubTab = 'record' | 'challenges' | 'info';
type MmSubTab = 'seasons' | 'info';

function RankedTab() {
  const { t } = useTranslation();
  const { currentCommunity, isInMyCommunity, canAdminCurrentCommunity, myParticipantId } = useCommunity();
  const isAdminHere = canAdminCurrentCommunity;
  const communityId = currentCommunity?.id;
  const [searchParams] = useSearchParams();
  const [matchType, setMatchType] = useState<RankedMatchType>(
    () => (searchParams.get('sub') as RankedMatchType | null) ?? 'duel'
  );
  const [subTab, setSubTab] = useState<RankedSubTab>('challenges');
  const [settings, setSettings] = useState<DuelSettingsType>(DEFAULT_DUEL_SETTINGS);
  const [selectedChallenge, setSelectedChallenge] = useState<string | null>(null);
  const [mmAssignment, setMmAssignment] = useState<MatchmakingAssignment | null>(null);
  const [mmSubTab, setMmSubTab] = useState<MmSubTab>('seasons');

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
    const isParticipant = myParticipantId === challenge.challengerId || myParticipantId === challenge.challengedId;
    if (!isAdminHere && !isParticipant) return;
    setSelectedChallenge(challenge.id);
    setSubTab('record');
  };

  return (
    <div className="ranked-tab">
      <div className="ranked-header">
        <div>
          <h1><i className="fas fa-star" /> {t('ranked.title')}</h1>
          <p className="text-secondary">{t('ranked.subtitle')}</p>
        </div>
        <div className="ranked-actions">
          <select
            value={matchType}
            onChange={e => setMatchType(e.target.value as RankedMatchType)}
            className="match-type-select"
          >
            <option value="duel">{t('ranked.duels')}</option>
            <option value="matchmaking">{t('ranked.matchmaking')}</option>
          </select>
          {matchType === 'duel' && isAdminHere && (
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
              <i className="fas fa-swords" /> {t('ranked.manageChallenges')}
            </button>
            {(isAdminHere || (isInMyCommunity && selectedChallenge)) && (
              <button
                className={`ranked-tab-btn ${subTab === 'record' ? 'active' : ''}`}
                onClick={() => setSubTab('record')}
              >
                <i className="fas fa-gamepad" /> {selectedChallenge ? t('ranked.reportResult') : t('ranked.recordMatch')}
              </button>
            )}
            <button
              className={`ranked-tab-btn ${subTab === 'info' ? 'active' : ''}`}
              onClick={() => setSubTab('info')}
            >
              <i className="fas fa-info-circle" /> {t('ranked.info')}
            </button>
          </div>

          <div className="ranked-content">
            {subTab === 'challenges' && (
              <ActiveChallenges onChallengeSelect={handleChallengeSelect} />
            )}
            {subTab === 'record' && (isAdminHere || (isInMyCommunity && selectedChallenge)) && (
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

      {matchType === 'matchmaking' && !mmAssignment && (
        <>
          <div className="ranked-tabs">
            <button
              className={`ranked-tab-btn ${mmSubTab === 'seasons' ? 'active' : ''}`}
              onClick={() => setMmSubTab('seasons')}
            >
              <i className="fas fa-shuffle" /> {t('ranked.matchmaking')}
            </button>
            <button
              className={`ranked-tab-btn ${mmSubTab === 'info' ? 'active' : ''}`}
              onClick={() => setMmSubTab('info')}
            >
              <i className="fas fa-info-circle" /> {t('ranked.info')}
            </button>
          </div>
          <div className="ranked-content">
            {mmSubTab === 'seasons' && (
              <MatchmakingTab
                onReportAssignment={(a) => {
                  setMmAssignment(a);
                  setSubTab('record');
                }}
              />
            )}
            {mmSubTab === 'info' && <MatchmakingInfo />}
          </div>
        </>
      )}

      {matchType === 'matchmaking' && mmAssignment && subTab === 'record' && (
        <>
          <div className="ranked-tabs">
            <button className="ranked-tab-btn" onClick={() => { setMmAssignment(null); setSubTab('challenges'); }}>
              <i className="fas fa-arrow-left" /> {t('ranked.mm.backToMatchmaking')}
            </button>
          </div>
          <div className="ranked-content">
            <RecordMatchTab
              matchType="matchmaking"
              mmAssignment={mmAssignment}
              onMatchRecorded={() => {
                setMmAssignment(null);
                setSubTab('challenges');
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default RankedTab;
