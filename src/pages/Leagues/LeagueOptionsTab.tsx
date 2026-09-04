import { useTranslation } from 'react-i18next';
import { League } from '@/models/league';
import { getGame } from '@/data/games';
import { getLeagueDisplayStatus } from '@/services/leagues/leagueService';
import './LeagueOptionsTab.css';

interface LeagueOptionsTabProps {
  league: League;
}

function LeagueOptionsTab({ league }: LeagueOptionsTabProps) {
  const { t } = useTranslation();

  const totalMatches = (league.participantIds.length * (league.participantIds.length - 1) / 2) * league.roundsPerOpponent;
  const displayStatus = getLeagueDisplayStatus(league);

  const periodLabel = league.periodDays === 7
    ? t('league.options.periodWeekly')
    : league.periodDays === 14
      ? t('league.options.periodBiweekly')
      : t('league.options.periodDays', { count: league.periodDays });

  return (
    <div className="options-tab">
      <div className="card">
        <div className="options-header">
          <h3>{t('league.options.title')}</h3>
          <span className="options-subtitle">
            {t('league.options.subtitle')}
          </span>
        </div>

        <div className="options-grid">
          <div className="option-card">
            <div className="option-label">{t('league.options.labels.leagueName')}</div>
            <div className="option-value">{league.name}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.game')}</div>
            <div className="option-value">{getGame(league.gameId)?.shortName ?? league.gameId}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.participants')}</div>
            <div className="option-value">{league.participantIds.length}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.totalMatches')}</div>
            <div className="option-value">{totalMatches}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.roundsPerOpponent')}</div>
            <div className="option-value">{t('league.options.rounds', { count: league.roundsPerOpponent })}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.gamesPerMatch')}</div>
            <div className="option-value">{t('league.options.bestOf', { count: league.gamesPerMatch })}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.matchesPerPlayerPerPeriod')}</div>
            <div className="option-value">{t('league.options.matchesPerPlayer', { count: league.matchesPerPlayerPerPeriod })}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.periodFrequency')}</div>
            <div className="option-value">{periodLabel}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.startDate')}</div>
            <div className="option-value">{new Date(league.startDate).toLocaleDateString()}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.noShowTolerance')}</div>
            <div className="option-value">{t('league.options.noShowsBeforeKick', { count: league.maxNoShowsBeforeKick })}</div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.playoffs')}</div>
            <div className="option-value">
              {league.playoffsEnabled ? t('league.options.playoffsEnabled', { multiplier: league.playoffsEloMultiplier }) : t('league.options.playoffsDisabled')}
            </div>
          </div>

          <div className="option-card">
            <div className="option-label">{t('league.options.labels.status')}</div>
            <div className={`option-value status-badge status-${displayStatus}`}>
              {t(`league.options.status.${displayStatus}`)}
            </div>
          </div>
        </div>

        <div className="options-elo-section">
          <h4>{t('league.options.eloTitle')}</h4>
          <p>
            {t('league.options.eloDesc')}
          </p>
          <ul>
            <li>{t('league.options.eloBullets.victories')}</li>
            <li>{t('league.options.eloBullets.noShows')}</li>
            <li>{t('league.options.eloBullets.presentNoElo')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default LeagueOptionsTab;
