import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  IconCalendar,
  IconChevronLeft,
  IconClock,
  IconHome,
  IconLayers,
  IconList,
  IconLogOut,
  IconRoute,
  IconSitemap,
} from './icons';

const STUDENT_NAV = [
  { to: '/estudiante', label: 'Mi perfil', icon: IconHome },
  { to: '/estudiante/malla', label: 'Inscripción', icon: IconLayers },
  { to: '/estudiante/historial', label: 'Historial', icon: IconClock },
  { to: '/estudiante/pensum', label: 'Pensum', icon: IconSitemap },
  { to: '/estudiante/plan-estudio', label: 'Plan de estudio', icon: IconRoute },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Panel', icon: IconHome },
  { to: '/admin/plantillas', label: 'Plantillas', icon: IconList },
  { to: '/admin/periodos', label: 'Períodos', icon: IconCalendar },
  { to: '/admin/plan-estudio', label: 'Plan de estudio', icon: IconRoute },
];

interface AppShellProps {
  title: string;
  backTo?: string;
  backLabel?: string;
  contextBar?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, backTo, backLabel, contextBar, children }: AppShellProps) {
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
          {contextBar}
        </header>

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
