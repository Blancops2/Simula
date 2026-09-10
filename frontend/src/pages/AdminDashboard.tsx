import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useInactivityLogout } from '../auth/useInactivityLogout';
import { AppShell } from '../components/AppShell';

export function AdminDashboard() {
  const { user } = useAuth();
  useInactivityLogout(true);

  return (
    <AppShell title="Panel del administrador">
      <section className="panel">
        <h2>Sesión activa</h2>
        <div className="field-row">
          <span className="field-label">Correo</span>
          <span>{user?.email}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Gestión académica</h2>
        <p>Administra las carreras, plantillas de malla curricular y sus árboles de clases.</p>
        <Link to="/admin/plantillas" className="btn btn-primary">
          Gestionar plantillas de malla curricular
        </Link>
      </section>

      <section className="panel">
        <h2>Períodos académicos</h2>
        <p>Crea, edita y habilita o deshabilita los períodos disponibles para simulación.</p>
        <Link to="/admin/periodos" className="btn btn-primary">
          Gestionar períodos
        </Link>
      </section>
    </AppShell>
  );
}
