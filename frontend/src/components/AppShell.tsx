import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { IconChevronLeft, IconClock, IconHome, IconLayers, IconList, IconLogOut, IconSitemap } from './icons';

const STUDENT_NAV = [
  { to: '/estudiante', label: 'Mi perfil', icon: IconHome },
  { to: '/estudiante/malla', label: 'Seleccionar clases', icon: IconLayers },
  { to: '/estudiante/historial', label: 'Historial', icon: IconClock },
  { to: '/estudiante/pensum', label: 'Pensum', icon: IconSitemap },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Panel', icon: IconHome },
  { to: '/admin/plantillas', label: 'Plantillas', icon: IconList },
];

interface AppShellProps {
  title: string;
  backTo?: string;
  backLabel?: string;
  children: ReactNode;
}

export function AppShell({ title, backTo, backLabel, children }: AppShellProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navItems = user?.role === 'ADMINISTRADOR' ? ADMIN_NAV : STUDENT_NAV;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">Σimula</div>
        <div className="app-sidebar-role">
          {user?.role === 'ADMINISTRADOR' ? 'Administrador' : 'Estudiante'}
        </div>

        <nav className="app-nav">
          {navItems.map((item) => {
            const ItemIcon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to} className={`app-nav-link ${active ? 'active' : ''}`}>
                <ItemIcon />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar-footer">
          <span className="app-user-email">{user?.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
            <IconLogOut />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="app-content">
        <header className="app-topbar">
          {backTo && (
            <Link to={backTo} className="app-back-link">
              <IconChevronLeft width={14} height={14} />
              {backLabel ?? 'Volver'}
            </Link>
          )}
          <div className="app-topbar-row">
            <h1 className="app-page-title">{title}</h1>
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
