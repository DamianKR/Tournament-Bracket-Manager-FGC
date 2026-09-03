import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { getPath, currentCommunity, allCommunities } = useCommunity();

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="container">
          {currentCommunity ? (
            <>
              <h1 className="dashboard-title">Competitive Gaming Ecosystem <br />{currentCommunity.name}</h1>
              {currentCommunity.shortName && (
                <p className="dashboard-hero-shortname">{currentCommunity.shortName}</p>
              )}
              <p className="dashboard-subtitle">
                Local-first brackets, weekly leagues, ranked duels and ELO tracking for your community.
              </p>
              <p className="dashboard-subtitle">
                {currentCommunity.description || 'Your competitive gaming community.'}
              </p>
              <div className="dashboard-hero-actions">
                <button className="btn-primary" onClick={() => navigate(getPath('events'))}>
                  <i className="fas fa-trophy" /> Events
                </button>
                <button className="btn-outline" onClick={() => navigate(getPath('ranking'))}>
                  <i className="fas fa-chart-line" /> Ranking
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="dashboard-title">Competitive Gaming Ecosystem</h1>
              <p className="dashboard-subtitle">
                Local-first brackets, weekly leagues, ranked duels and ELO tracking for your community.
              </p>
              <div className="dashboard-hero-actions">
                <button className="btn-primary" onClick={() => navigate('/communities')}>
                  <i className="fas fa-users" /> Explore Communities
                </button>
                <button className="btn-outline" onClick={() => navigate('/communities')}>
                  <i className="fas fa-chart-line" /> View Ranking
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="container">
          <h2 className="dashboard-section-title">What is this?</h2>
          <p className="dashboard-text">
            A space built for competitive gaming communities. Register players, organize tournaments,
            run weekly leagues, challenge others to ranked duels and watch the global ELO ranking
            evolve as matches get played.
          </p>
        </div>
      </section>

      <section className="dashboard-section dashboard-section-alt">
        <div className="container">
          <h2 className="dashboard-section-title">How it works</h2>
          <div className="dashboard-steps">
            <div className="dashboard-step card">
              <span className="dashboard-step-number">1</span>
              <h3>Register Players</h3>
              <p>Build the roster with aliases, games and main characters.</p>
            </div>
            <div className="dashboard-step card">
              <span className="dashboard-step-number">2</span>
              <h3>Run Events</h3>
              <p>Create tournaments or weekly leagues and invite participants.</p>
            </div>
            <div className="dashboard-step card">
              <span className="dashboard-step-number">3</span>
              <h3>Record Results</h3>
              <p>Confirm match winners and keep league scores up to date.</p>
            </div>
            <div className="dashboard-step card">
              <span className="dashboard-step-number">4</span>
              <h3>Track Ranking</h3>
              <p>ELO and league points update the global leaderboard.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="container">
          <h2 className="dashboard-section-title">Areas</h2>
          <div className="dashboard-cards">
            <div className="dashboard-card card" onClick={() => navigate(getPath('events'))}>
              <i className="fas fa-trophy" />
              <h3>Tournaments</h3>
              <p>Single and double elimination brackets with optional ELO rewards.</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate(getPath('events?tab=leagues'))}>
              <i className="fas fa-calendar-alt" />
              <h3>Leagues</h3>
              <p>Weekly round-robin seasons with schedules and standings.</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate(getPath('events?tab=ranked'))}>
              <i className="fas fa-khanda" />
              <h3>Ranked Duels</h3>
              <p>Challenge other players to head-to-head ranked matches.</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate(getPath('ranking'))}>
              <i className="fas fa-list-ol" />
              <h3>Ranking</h3>
              <p>Global ELO leaderboard, match history and progression.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-cta">
        <div className="container">
          {currentCommunity && isAuthenticated ? (
            <>
              <h2 className="dashboard-section-title">Welcome back{user?.username ? `, ${user.username}` : ''}</h2>
              <p className="dashboard-text">
                {user?.role === 'superadmin'
                  ? `You are the global superadmin. Currently viewing ${currentCommunity.name}.`
                  : `You are viewing ${currentCommunity.name}. Jump into the latest events or check the ranking.`}
              </p>
              <button className="btn-primary" onClick={() => navigate(getPath('events'))}>
                <i className="fas fa-trophy" /> Go to Events
              </button>
            </>
          ) : isAuthenticated ? (
            <>
              <h2 className="dashboard-section-title">Welcome back{user?.username ? `, ${user.username}` : ''}</h2>
              <p className="dashboard-text">
                {user?.role === 'superadmin'
                  ? 'You are the global superadmin. Choose a community from the list below.'
                  : 'You are all set. Jump into your community or explore others.'}
              </p>
              <button className="btn-primary" onClick={() => navigate('/communities')}>
                <i className="fas fa-users" /> {allCommunities.length > 0 ? 'Choose a Community' : 'Explore Communities'}
              </button>
            </>
          ) : (
            <>
              <h2 className="dashboard-section-title">Ready to join?</h2>
              <p className="dashboard-text">
                Log in with your account to enter tournaments, take part in leagues and track your ranking.
                New here? Reach out to an admin to get your player profile set up.
              </p>
              <button className="btn-primary" onClick={() => navigate('/login')}>
                <i className="fas fa-sign-in-alt" /> Log In
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
