/**
 * StartggCallbackPage
 *
 * Página que start.gg redirige tras el OAuth.
 * URL: /auth/startgg/callback?code=xxx&state=yyy
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { completeStartggOAuth } from '@/services/startgg/startggService';
import type { StartggLinkStatus } from '@/services/startgg/startggService';
import { useAuth } from '@/contexts/AuthContext';
import './StartggCallbackPage.css';

type Status = 'loading' | 'success' | 'error';

const REDIRECT_DELAY = 10; // segundos

export default function StartggCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();
  const { user, refreshUser } = useAuth();

  const [status,   setStatus]   = useState<Status>('loading');
  const [message,  setMessage]  = useState('Conectando con start.gg…');
  const [result,   setResult]   = useState<StartggLinkStatus | null>(null);
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);
  const done   = useRef(false);
  const target = useRef<string>('/');

  // Calcular ruta de destino
  useEffect(() => {
    const communityId   = user?.communityId;
    const participantId = user?.participantId;
    if (communityId && participantId) {
      target.current = `/c/${communityId}/participants/${participantId}?tab=edit`;
    }
  }, [user]);

  // OAuth callback principal
  useEffect(() => {
    if (done.current) return;
    done.current = true;

    async function handleCallback() {
      const code  = searchParams.get('code');
      const state = searchParams.get('state');

      const savedState = sessionStorage.getItem('startgg_oauth_state');
      sessionStorage.removeItem('startgg_oauth_state');

      if (!code) {
        setStatus('error');
        setMessage('No se recibió el código de autorización de start.gg.');
        return;
      }

      if (savedState && state !== savedState) {
        setStatus('error');
        setMessage('El state de seguridad no coincide. Por favor intenta de nuevo.');
        return;
      }

      try {
        const data = await completeStartggOAuth(code);
        setResult(data);
        setStatus('success');
        setMessage('¡Cuenta vinculada exitosamente!');
        await refreshUser();
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Error desconocido al conectar con start.gg.');
      }
    }

    handleCallback();
  }, [searchParams, refreshUser]);

  // Countdown de redirección automática (solo en éxito)
  useEffect(() => {
    if (status !== 'success') return;
    if (countdown <= 0) { navigate(target.current, { replace: true }); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [status, countdown, navigate]);

  function resolveTarget() {
    const communityId   = user?.communityId;
    const participantId = user?.participantId;
    if (communityId && participantId) {
      return `/c/${communityId}/participants/${participantId}?tab=edit`;
    }
    return target.current;
  }

  const goNow = () => navigate(resolveTarget(), { replace: true });
  const progress = ((REDIRECT_DELAY - countdown) / REDIRECT_DELAY) * 100;

  return (
    <div className="sgcb-page">
      {/* Glow de fondo */}
      <div className="sgcb-bg-glow" />

      <div className="sgcb-card card">
        {/* Header */}
        <div className="sgcb-header">
          <div className="sgcb-logo-wrap">
            <span className="sgcb-logo">start<span>.gg</span></span>
            <span className="sgcb-x">×</span>
            <span className="sgcb-app">RankNexus</span>
          </div>
          <p className="sgcb-subtitle">Vinculación de cuenta</p>
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <div className="sgcb-body">
            <div className="sgcb-spinner-ring">
              <div className="sgcb-spinner" />
            </div>
            <p className="sgcb-status-text">{message}</p>
            <p className="sgcb-hint">Verificando tu identidad con start.gg…</p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && result && (
          <div className="sgcb-body">
            <div className="sgcb-success-icon">
              <i className="fas fa-check" />
            </div>

            <div className="sgcb-connected-block">
              <p className="sgcb-connected-label">Conectado como</p>
              <p className="sgcb-gamer-tag">
                {result.startggGamerTag ?? result.startggSlug ?? `Usuario #${result.startggUserId}`}
              </p>
              {result.startggSlug && (
                <a
                  className="sgcb-slug-link"
                  href={`https://start.gg/${result.startggSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fas fa-external-link-alt" />
                  {result.startggSlug}
                </a>
              )}
            </div>

            <div className="sgcb-info-row">
              <div className="sgcb-info-chip">
                <i className="fas fa-id-badge" />
                <span>Player ID: <strong>{result.startggPlayerId ?? '—'}</strong></span>
              </div>
              <div className="sgcb-info-chip">
                <i className="fas fa-shield-alt" />
                <span>Los torneos importados te identificarán automáticamente</span>
              </div>
            </div>

            {/* Countdown + botón */}
            <div className="sgcb-footer">
              <div className="sgcb-progress-bar">
                <div
                  className="sgcb-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="sgcb-redirect-text">
                Redirigiendo en <strong>{countdown}s</strong>…
              </p>
              <button className="btn-primary sgcb-go-btn" onClick={goNow}>
                <i className="fas fa-arrow-right" /> Ir ahora
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="sgcb-body">
            <div className="sgcb-error-icon">
              <i className="fas fa-times" />
            </div>
            <p className="sgcb-status-text sgcb-status-error">{message}</p>
            <p className="sgcb-hint">
              Esto puede ocurrir si el enlace expiró o si accediste directamente a esta página.
            </p>
            <button className="btn-secondary sgcb-go-btn" onClick={() => navigate(resolveTarget(), { replace: true })}>
              <i className="fas fa-arrow-left" /> Volver al perfil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
