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
} from '@/services/auth/authService';

const ALL_ADMIN_ROLES = ['superadmin', 'community_admin', 'admin'];
const COMMUNITY_OWNER_ROLES = ['superadmin', 'community_admin'];

interface AuthContextType {
  /** Usuario autenticado o null si no hay sesión. */
  user: SessionUser | null;
  /** true mientras se verifica el token al inicio. */
  isLoading: boolean;
  /** true si hay una sesión activa. */
  isAuthenticated: boolean;
  /** true si el usuario tiene rol admin (cualquier nivel: admin asistente, community owner o superadmin). */
  isAdmin: boolean;
  /** true si es superadmin. */
  isSuperAdmin: boolean;
  /** true si es community owner (community_admin) o superadmin. Puede dar/quitar admin. */
  isCommunityOwner: boolean;
  /** true si es admin asistente (no puede dar/quitar admin). */
  isCommunityAdminAssistant: boolean;
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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginNotifications, setLoginNotifications] = useState<AppNotification[] | null>(null);

  // Restaurar sesión al montar
  useEffect(() => {
    getMe()
      .then(setUser)
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await authLogin(username, password);
    const loggedInUser: SessionUser = {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
      participantId: session.user.participantId,
      communityId: session.user.communityId,
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

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    isAdmin: ALL_ADMIN_ROLES.includes(user?.role ?? ''),
    isSuperAdmin: user?.role === 'superadmin',
    isCommunityOwner: COMMUNITY_OWNER_ROLES.includes(user?.role ?? ''),
    isCommunityAdminAssistant: user?.role === 'admin',
    loginNotifications,
    consumeLoginNotifications,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook para acceder al contexto de auth. Debe usarse dentro de <AuthProvider>. */
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
