import { useTranslation } from 'react-i18next';
import { League } from '@/models/league';
import { getGame } from '@/data/games';
import { formatInTimeZone } from '@/utils/timeZone';
import './LeagueInfoTab.css';

interface LeagueInfoTabProps {
  league: League;
}

function LeagueInfoTab({ league }: LeagueInfoTabProps) {
  const { t } = useTranslation();
  const weeks = Object.keys(league.weekStartDates || {}).map(Number).sort((a, b) => a - b);
  const lastWeek = weeks.length > 0 ? Math.max(...weeks) : 0;
  const lastWeekStart = lastWeek ? formatInTimeZone(league.weekStartDates[lastWeek], league.timeZone) : t('league.info.tbd');
  const timeZone = league.timeZone || 'America/Havana';
  const startDate = formatInTimeZone(league.startDate, league.timeZone);
  const winByGames = Math.ceil(league.gamesPerMatch / 2);
  const gameName = getGame(league.gameId)?.shortName ?? league.gameId;

  return (
    <div className="league-info-tab">
      <div className="info-hero card">
        <h2>{t('league.info.title')}</h2>
        <p className="league-info-subtitle">
          {t('league.info.subtitle', { name: league.name })}
        </p>
      </div>

      <div className="info-grid">
        <div className="info-card card">
          <h3><i className="fas fa-globe" /> {t('league.info.timeZoneTitle')}</h3>
          <p className="info-text">
            {t('league.info.timeZoneIntro')} <strong>{timeZone}</strong>{t('league.info.timeZoneMid')} <strong>{startDate}</strong>{t('league.info.timeZoneOutro')}
          </p>
        </div>

        <div className="info-card card">
          <h3><i className="fas fa-calendar-alt" /> {t('league.info.scheduleTitle')}</h3>
          <ul>
            <li><strong>{t('league.info.startLabel')}</strong> {startDate}</li>
            <li><strong>{t('league.info.periodLabel')}</strong> {t('league.info.periodValue', { days: league.periodDays })}</li>
            <li><strong>{t('league.info.totalWeeksLabel')}</strong> {weeks.length}</li>
            <li><strong>{t('league.info.lastWeekStartsLabel')}</strong> {lastWeekStart}</li>
            <li><strong>{t('league.info.matchesPerPlayerLabel')}</strong> {league.matchesPerPlayerPerPeriod}</li>
          </ul>
        </div>

        <div className="info-card card">
          <h3><i className="fas fa-gamepad" /> {t('league.info.formatTitle')}</h3>
          <ul>
            <li><strong>{t('league.info.gameLabel')}</strong> {gameName}</li>
            <li><strong>{t('league.info.bestOfLabel')}</strong> {league.gamesPerMatch} {t('common.game')}s</li>
            <li><strong>{t('league.info.roundsPerOpponentLabel')}</strong> {league.roundsPerOpponent}</li>
            <li><strong>{t('league.info.playersLabel')}</strong> {league.participantIds.length}</li>
          </ul>
          <p className="info-text">
            {t('league.info.winByPrefix')} <strong>{winByGames}</strong> {t('league.info.winBySuffix')}
          </p>
        </div>

        <div className="info-card card">
          <h3><i className="fas fa-shield-alt" /> {t('league.info.penaltiesTitle')}</h3>
          <ul>
            <li><strong>{t('league.info.graceLabel')}</strong> {t('league.info.graceValue', { days: league.gracePeriodDays })}</li>
            <li><strong>{t('league.info.noShowsLabel')}</strong> {league.maxNoShowsBeforeKick}</li>
            <li><strong>{t('league.info.playoffsLabel')}</strong> {league.playoffsEnabled ? t('league.info.playoffsEnabled', { multiplier: league.playoffsEloMultiplier }) : t('league.info.playoffsDisabled')}</li>
          </ul>
        </div>

        <div className="info-card card info-highlight">
          <h3><i className="fas fa-info-circle" /> {t('league.info.howItWorksTitle')}</h3>
          <ol>
            <li>
              <strong>{t('league.info.howItWorks.weeklyAssignment')}</strong>
            </li>
            <li>
              <strong>{t('league.info.howItWorks.playMatch')}</strong>
            </li>
            <li>
              <strong>{t('league.info.howItWorks.reportResult')}</strong>
            </li>
            <li>
              <strong>{t('league.info.howItWorks.confirm')}</strong>
            </li>
            <li>
              <strong>{t('league.info.howItWorks.differ')}</strong>
            </li>
            <li>
              <strong>{t('league.info.howItWorks.grace')}</strong> {t('league.info.howItWorks.graceSuffix', { days: league.gracePeriodDays })}
            </li>
            <li>
              <strong>{t('league.info.howItWorks.noShows')}</strong> {t('league.info.howItWorks.noShowsSuffix', { count: league.maxNoShowsBeforeKick })}
            </li>
            <li>
              <strong>{t('league.info.howItWorks.standings')}</strong>
            </li>
          </ol>
        </div>

        <div className="info-card card">
          <h3><i className="fas fa-exclamation-circle" /> {t('league.info.importantTitle')}</h3>
          <ul>
            <li>{t('league.info.important.sameScore')}</li>
            <li>{t('league.info.important.screenshot')}</li>
            <li>{t('league.info.important.expired', { days: league.gracePeriodDays })}</li>
            <li>{t('league.info.important.adminConflict')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default LeagueInfoTab;
