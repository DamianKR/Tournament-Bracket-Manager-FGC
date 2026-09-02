/**
 * LoginPage
 *
 * Maneja dos casos:
 *  1. needsSetup === true → formulario de primer setup (crea admin inicial)
 *  2. normal → login con username + password
 */

import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthStatus, setupAdmin } from '@/services/auth/authService';
import './LoginPage.css';

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from ?? '/communities';

  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Si ya está autenticado, redirigir
  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true });
  }, [isAuthenticated, navigate, from]);

  // Verificar si se necesita setup
  useEffect(() => {
    getAuthStatus()
      .then(status => setNeedsSetup(status.needsSetup))
      .finally(() => setCheckingSetup(false));
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await setupAdmin(username.trim(), password);
      navigate('/communities', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSetup) return null;

  return (
    <div className="login-page">
      <div className="login-card card">
        <div className="login-logo">
          <i className="fas fa-trophy" />
          <span>Bracket Manager</span>
        </div>

        {needsSetup ? (
          <>
            <div className="login-header">
              <h2>First Time Setup</h2>
              <p className="text-secondary">Create your admin account to get started</p>
            </div>

            <form onSubmit={handleSetup} className="login-form">
              <div className="form-group">
                <label htmlFor="setup-username">Username</label>
                <input
                  id="setup-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label htmlFor="setup-password">Password</label>
                <input
                  id="setup-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label htmlFor="setup-confirm">Confirm Password</label>
                <input
                  id="setup-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
              </div>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="btn-primary login-btn" disabled={loading}>
                {loading ? 'Setting up…' : 'Create Admin Account'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="login-header">
              <h2>Sign In</h2>
              <p className="text-secondary">Enter your credentials to continue</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label htmlFor="login-username">Username</label>
                <input
                  id="login-username"
                  className="login-input"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Your username"
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  onKeyDown={e => { if (e.key === 'Enter') handleLogin(e as any); }}
                />
              </div>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="btn-primary login-btn" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
