/**
 * AdminRoute — redirige a /events si el usuario no es admin.
 * Si no hay sesión redirige a /login.
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface AdminRouteProps {
  children: React.ReactNode;
}

function AdminRoute({ children }: AdminRouteProps) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/events" replace />;

  return <>{children}</>;
}

export default AdminRoute;
