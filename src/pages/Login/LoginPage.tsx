/**
 * LoginPage
 *
 * Maneja dos casos:
 *  1. needsSetup === true → formulario de primer setup (crea admin inicial)
 *  2. normal → login con username + password
 */

import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthStatus, setupAdmin } from '@/services/auth/authService';
import type { SessionUser } from '@/models/auth';
import './LoginPage.css';

function LoginPage() {
  const { t } = useTranslation();
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [needsSetup, setNeedsSetup] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Si ya está autenticado, redirigir a su comunidad o al dashboard principal
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getPostLoginTarget(user), { replace: true });
    }
  }, [isAuthenticated, navigate, user]);

  // Verificar si se necesita setup
  useEffect(() => {
    getAuthStatus()
      .then(status => setNeedsSetup(status.needsSetup))
      .finally(() => setCheckingSetup(false));
  }, []);

  function getPostLoginTarget(u: SessionUser): string {
    // Superadmin va al dashboard principal; todo el resto va a su comunidad.
    if (u.role === 'superadmin' || !u.communityId) return '/';
    return `/c/${u.communityId}`;
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('login.errors.missingCredentials'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(username.trim(), password);
      navigate(getPostLoginTarget(loggedInUser), { replace: true });
    } catch (err: any) {
      setError(err.message || t('login.errors.loginFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('login.errors.missingSetup'));
      return;
    }
    if (password.length < 6) {
      setError(t('login.errors.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('login.errors.passwordsMismatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await setupAdmin(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || t('login.errors.setupFailed'));
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
          <span>{t('appName')}</span>
        </div>

        {needsSetup ? (
          <>
            <div className="login-header">
              <h2>{t('login.firstTimeSetup')}</h2>
              <p className="text-secondary">{t('login.setupDescription')}</p>
            </div>

            <form onSubmit={handleSetup} className="login-form">
              <div className="form-group">
                <label htmlFor="setup-username">{t('login.username')}</label>
                <input
                  id="setup-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={t('login.placeholderPasswordAdmin')}
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label htmlFor="setup-password">{t('login.password')}</label>
                <input
                  id="setup-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('login.placeholderAtLeast6')}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label htmlFor="setup-confirm">{t('login.confirmPassword')}</label>
                <input
                  id="setup-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder={t('login.placeholderConfirmPassword')}
                  autoComplete="new-password"
                />
              </div>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="btn-primary login-btn" disabled={loading}>
                {loading ? t('login.buttons.settingUp') : t('login.buttons.createAdmin')}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="login-header">
              <h2>{t('login.signIn')}</h2>
              <p className="text-secondary">{t('login.signInDescription')}</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label htmlFor="login-username">{t('login.username')}</label>
                <input
                  id="login-username"
                  className="login-input"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={t('login.placeholderUsername')}
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label htmlFor="login-password">{t('login.password')}</label>
                <input
                  id="login-password"
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('login.placeholderPassword')}
                  autoComplete="current-password"
                  onKeyDown={e => { if (e.key === 'Enter') handleLogin(e as any); }}
                />
              </div>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="btn-primary login-btn" disabled={loading}>
                {loading ? t('login.buttons.signingIn') : t('login.buttons.signIn')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default LoginPage;
