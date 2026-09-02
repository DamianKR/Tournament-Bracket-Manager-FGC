/**
 * SuperAdminRoute — redirige si el usuario no es superadmin.
 * Si no hay sesión redirige a /login.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface SuperAdminRouteProps {
  children: React.ReactNode;
}

function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { isAuthenticated, isSuperAdmin, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/communities" replace />;

  return <>{children}</>;
}

export default SuperAdminRoute;
