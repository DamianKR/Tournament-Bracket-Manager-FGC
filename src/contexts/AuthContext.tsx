/**
 * AuthContext — estado global de sesión de usuario.
 *
 * Al montar la app, intenta restaurar la sesión desde el token en localStorage.
 * Si el servidor no está disponible devuelve null silenciosamente.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { SessionUser } from '@/models/auth';
import type { AppNotification } from '@/models/notification';
import {
  login as authLogin,
  logout as authLogout,
  getMe,
  refreshToken,
  isTokenExpiringSoon,
} from '@/services/auth/authService';

interface AuthContextType {
  /** Usuario autenticado o null si no hay sesión. */
  user: SessionUser | null;
  /** true mientras se verifica el token al inicio. */
  isLoading: boolean;
  /** true si hay una sesión activa. */
  isAuthenticated: boolean;
  /**
   * true si el usuario es admin (cualquier nivel) de AL MENOS UNA comunidad,
   * o superadmin. Gate "grueso" para rutas/nav; para saber si administra LA
   * comunidad que se está viendo, usar `canAdminCurrentCommunity` de
   * CommunityContext (fuente de verdad por membership).
   */
  isAdmin: boolean;
  /** true si es superadmin (único rol global). */
  isSuperAdmin: boolean;
  /** Notificaciones recibidas en el login más reciente, o null si no hay. */
  loginNotifications: AppNotification[] | null;
  /** Consume las notificaciones de login (para que otro contexto las use una sola vez). */
  consumeLoginNotifications: () => AppNotification[];
  /**
   * Intenta hacer login. Lanza Error con mensaje si falla.
   * Retorna el usuario logueado para que el caller pueda decidir
   * la redirección inmediata (comunidad propia vs dashboard principal).
   */
  login: (username: string, password: string) => Promise<SessionUser>;
  /** Cierra sesión y limpia el contexto. */
  logout: () => void;
  /** Actualiza el usuario en contexto (por ejemplo tras un cambio de username). */
  refreshUser: () => Promise<void>;
  /** true si la sesión expiró en background (token inválido detectado en un write). */
  sessionExpired: boolean;
  /** Llama esto después de mostrar el banner de sesión expirada para limpiarlo. */
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginNotifications, setLoginNotifications] = useState<AppNotification[] | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Restaurar sesión al montar + auto-refresh si el token está por expirar
  useEffect(() => {
    async function restoreSession() {
      try {
        // Si el token expira en menos de 1 día, intentar refrescarlo silenciosamente
        if (isTokenExpiringSoon(86400)) {
          const refreshed = await refreshToken();
          if (refreshed) { setUser(refreshed); return; }
        }
        const me = await getMe();
        setUser(me);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  // Escuchar el evento global de sesión expirada (disparado por writes autenticados con 401)
  useEffect(() => {
    function handleExpired() {
      authLogout();
      setUser(null);
      setSessionExpired(true);
    }
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await authLogin(username, password);
    const loggedInUser: SessionUser = {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
      participantId: session.user.participantId,
      communityId: session.user.communityId,
      memberships: session.user.memberships,
      communityIds: session.user.communityIds,
      participantByCommunity: session.user.participantByCommunity,
      gameAdminFor: session.user.gameAdminFor,
    };
    setUser(loggedInUser);
    setLoginNotifications(session.notifications || []);
    return loggedInUser;
  }, []);

  const consumeLoginNotifications = useCallback(() => {
    const notifs = loginNotifications ?? [];
    setLoginNotifications(null);
    return notifs;
  }, [loginNotifications]);

  const logout = useCallback(() => {
    authLogout();
    setUser(null);
    setLoginNotifications(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const updated = await getMe();
    setUser(updated);
  }, []);

  const isAdminSomewhere =
    user?.role === 'superadmin' ||
    (user?.memberships ?? []).some(
      (m) => m.isActive !== false && (m.role === 'admin' || m.role === 'community_admin')
    );

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    isAdmin: isAdminSomewhere,
    isSuperAdmin: user?.role === 'superadmin',
    loginNotifications,
    consumeLoginNotifications,
    login,
    logout,
    refreshUser,
    sessionExpired,
    clearSessionExpired,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook para acceder al contexto de auth. Debe usarse dentro de <AuthProvider>. */
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
