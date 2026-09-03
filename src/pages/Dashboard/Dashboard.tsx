import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const { getPath, currentCommunity } = useCommunity();

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="container">
          {currentCommunity ? (
            <>
              <h1 className="dashboard-title">{t('dashboard.title')}<br />{currentCommunity.name}</h1>
              {currentCommunity.shortName && (
                <p className="dashboard-hero-shortname">{currentCommunity.shortName}</p>
              )}
              <p className="dashboard-subtitle">{t('dashboard.subtitle')}</p>
              <p className="dashboard-subtitle">
                {currentCommunity.description || t('dashboard.yourCommunity')}
              </p>
              <div className="dashboard-hero-actions">
                <button className="btn-primary" onClick={() => navigate(getPath('events'))}>
                  <i className="fas fa-trophy" /> {t('header.events')}
                </button>
                <button className="btn-outline" onClick={() => navigate(getPath('ranking'))}>
                  <i className="fas fa-chart-line" /> {t('header.ranking')}
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="dashboard-title">{t('dashboard.title')}</h1>
              <p className="dashboard-subtitle">{t('dashboard.subtitle')}</p>
              <div className="dashboard-hero-actions">
                <button className="btn-primary" onClick={() => navigate('/communities')}>
                  <i className="fas fa-users" /> {t('dashboard.explore')}
                </button>
                <button className="btn-outline" onClick={() => navigate('/communities')}>
                  <i className="fas fa-chart-line" /> {t('dashboard.viewRanking')}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="container">
          <h2 className="dashboard-section-title">{t('dashboard.whatIsTitle')}</h2>
          <p className="dashboard-text">{t('dashboard.whatIsText')}</p>
        </div>
      </section>

      <section className="dashboard-section dashboard-section-alt">
        <div className="container">
          <h2 className="dashboard-section-title">{t('dashboard.howItWorksTitle')}</h2>
          <div className="dashboard-steps">
            <div className="dashboard-step card">
              <span className="dashboard-step-number">1</span>
              <h3>{t('dashboard.steps.register')}</h3>
              <p>{t('dashboard.steps.registerDesc')}</p>
            </div>
            <div className="dashboard-step card">
              <span className="dashboard-step-number">2</span>
              <h3>{t('dashboard.steps.run')}</h3>
              <p>{t('dashboard.steps.runDesc')}</p>
            </div>
            <div className="dashboard-step card">
              <span className="dashboard-step-number">3</span>
              <h3>{t('dashboard.steps.record')}</h3>
              <p>{t('dashboard.steps.recordDesc')}</p>
            </div>
            <div className="dashboard-step card">
              <span className="dashboard-step-number">4</span>
              <h3>{t('dashboard.steps.track')}</h3>
              <p>{t('dashboard.steps.trackDesc')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="container">
          <h2 className="dashboard-section-title">{t('dashboard.areasTitle')}</h2>
          <div className="dashboard-cards">
            <div className="dashboard-card card" onClick={() => navigate(getPath('events'))}>
              <i className="fas fa-trophy" />
              <h3>{t('dashboard.tournaments')}</h3>
              <p>{t('dashboard.tournamentsDesc')}</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate(getPath('events?tab=leagues'))}>
              <i className="fas fa-calendar-alt" />
              <h3>{t('dashboard.leagues')}</h3>
              <p>{t('dashboard.leaguesDesc')}</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate(getPath('events?tab=ranked'))}>
              <i className="fas fa-khanda" />
              <h3>{t('dashboard.duels')}</h3>
              <p>{t('dashboard.duelsDesc')}</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate(getPath('ranking'))}>
              <i className="fas fa-list-ol" />
              <h3>{t('dashboard.ranking')}</h3>
              <p>{t('dashboard.rankingDesc')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-cta">
        <div className="container">
          {currentCommunity && isAuthenticated ? (
            <>
              <h2 className="dashboard-section-title">{t('dashboard.welcomeBack')}{user?.username ? `, ${user.username}` : ''}</h2>
              <p className="dashboard-text">
                {user?.role === 'superadmin'
                  ? t('dashboard.superadminWelcome')
                  : t('dashboard.userWelcome')}
              </p>
              <button className="btn-primary" onClick={() => navigate(getPath('events'))}>
                <i className="fas fa-trophy" /> {t('header.events')}
              </button>
            </>
          ) : isAuthenticated ? (
            <>
              <h2 className="dashboard-section-title">{t('dashboard.welcomeBack')}{user?.username ? `, ${user.username}` : ''}</h2>
              <p className="dashboard-text">
                {user?.role === 'superadmin'
                  ? t('dashboard.superadminWelcome')
                  : t('dashboard.userWelcome')}
              </p>
              <button className="btn-primary" onClick={() => navigate('/communities')}>
                <i className="fas fa-users" /> {t('dashboard.goToCommunities')}
              </button>
            </>
          ) : (
            <>
              <h2 className="dashboard-section-title">{t('dashboard.readyTitle')}</h2>
              <p className="dashboard-text">{t('dashboard.readyText')}</p>
              <button className="btn-primary" onClick={() => navigate('/login')}>
                <i className="fas fa-sign-in-alt" /> {t('dashboard.login')}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
