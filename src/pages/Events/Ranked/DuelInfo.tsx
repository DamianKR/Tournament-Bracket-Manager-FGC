import { useEffect, useState } from 'react';
import { DuelSettings, DEFAULT_DUEL_SETTINGS } from '@/models/duel';
import { getDuelSettingsAsync, getNextWeeklyReset, formatTimeUntilReset } from '@/services/duels/duelService';
import { useCommunity } from '@/contexts/CommunityContext';
import './DuelInfo.css';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function DuelInfo() {
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

  const resetDayName = DAYS[settings.weeklyResetDay] ?? 'Monday';
  const resetTime = `${String(settings.weeklyResetHour).padStart(2, '0')}:${String(settings.weeklyResetMinute).padStart(2, '0')}`;

  return (
    <div className="duel-info card">
      <h2><i className="fas fa-info-circle" /> How Duels Work</h2>

      <section className="duel-info-section">
        <h3><i className="fas fa-bolt" /> What are Duels?</h3>
        <p>
          Duels are ranked one-vs-one challenges between players. They award ELO points and affect your global ranking.
          A duel is recorded as a ranked match and uses the standard ELO formula.
        </p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-fire" /> Weekly Challenge Limit</h3>
        <p>
          Each player can issue up to <strong>{settings.maxChallengesPerWeek}</strong> challenges per week.
          The weekly counter resets every <strong>{resetDayName} at {resetTime}</strong>.
        </p>
        {nextResetText && (
          <p className="duel-info-highlight">
            <i className="fas fa-clock" /> Next reset in {nextResetText}
          </p>
        )}
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-balance-scale" /> ELO Restriction</h3>
        <p>
          You cannot challenge a player who is more than <strong>{settings.eloRestriction}</strong> ELO points below you.
          This prevents high-ranked players from farming lower-ranked opponents.
        </p>
        <p className="duel-info-example">
          Example: if you have 1700 ELO, you can challenge players down to <strong>{1700 - settings.eloRestriction}</strong> ELO.
        </p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-hourglass-half" /> Challenge Expiration</h3>
        <p>
          A pending challenge expires after <strong>{settings.challengeExpirationDays} days</strong> if not accepted or recorded.
          Once expired, the challenge is no longer active and does not count against weekly limits.
        </p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-shield-alt" /> No Repeat Challenges</h3>
        <p>
          You can only challenge the same opponent once per week. Wait until the next weekly reset to challenge them again.
        </p>
      </section>

      <section className="duel-info-section">
        <h3><i className="fas fa-trophy" /> ELO Points</h3>
        <p>
          Winning a duel increases your ELO; losing decreases it. The amount depends on both players' current ELO and the winner's K-factor.
          Unranked players (with no points yet) start from 1500 for their first duel.
        </p>
      </section>
    </div>
  );
}

export default DuelInfo;
