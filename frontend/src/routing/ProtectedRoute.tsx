import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Role } from '../auth/types';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="app-loading-screen">Cargando sesión…</div>;
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
