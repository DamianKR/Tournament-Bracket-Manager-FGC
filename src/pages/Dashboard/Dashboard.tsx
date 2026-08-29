import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="container">
          <h1 className="dashboard-title">Competitive Gaming Ecosystem</h1>
          <p className="dashboard-subtitle">
            Local-first brackets, weekly leagues, ranked duels and ELO tracking for your community.
          </p>
          <div className="dashboard-hero-actions">
            <button className="btn-primary" onClick={() => navigate('/events')}>
              <i className="fas fa-trophy" /> Explore Events
            </button>
            <button className="btn-outline" onClick={() => navigate('/ranking')}>
              <i className="fas fa-chart-line" /> View Ranking
            </button>
          </div>
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
            <div className="dashboard-card card" onClick={() => navigate('/events')}>
              <i className="fas fa-trophy" />
              <h3>Tournaments</h3>
              <p>Single and double elimination brackets with optional ELO rewards.</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate('/events?tab=leagues')}>
              <i className="fas fa-calendar-alt" />
              <h3>Leagues</h3>
              <p>Weekly round-robin seasons with schedules and standings.</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate('/events?tab=ranked')}>
              <i className="fas fa-khanda" />
              <h3>Ranked Duels</h3>
              <p>Challenge other players to head-to-head ranked matches.</p>
            </div>
            <div className="dashboard-card card" onClick={() => navigate('/ranking')}>
              <i className="fas fa-list-ol" />
              <h3>Ranking</h3>
              <p>Global ELO leaderboard, match history and progression.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-cta">
        <div className="container">
          {isAuthenticated ? (
            <>
              <h2 className="dashboard-section-title">Welcome back{user?.username ? `, ${user.username}` : ''}</h2>
              <p className="dashboard-text">
                You're all set. Jump into the latest events, check the rankings or challenge other players.
              </p>
              <button className="btn-primary" onClick={() => navigate('/events')}>
                <i className="fas fa-trophy" /> Go to Events
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
