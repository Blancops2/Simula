import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPerfil } from '../api/estudianteApi';
import { useAuth } from '../auth/AuthContext';
import { useInactivityLogout } from '../auth/useInactivityLogout';
import { AppShell } from '../components/AppShell';
import { DonutChart } from '../components/DonutChart';
import type { PerfilEstudiante } from '../estudiante/types';

export function StudentDashboard() {
  const { user } = useAuth();
  useInactivityLogout(true);

  const [perfil, setPerfil] = useState<PerfilEstudiante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPerfil()
      .then(setPerfil)
      .catch(() => setError('No se pudo cargar tu perfil.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell title="Mi perfil">
      {loading && <p>Cargando…</p>}
      {error && <p className="page-error">{error}</p>}

      {perfil && (
        <>
          <section className="panel">
            <h2>{perfil.nombreCompleto ?? user?.email}</h2>
            <div className="field-row">
              <span className="field-label">Correo</span>
              <span>{perfil.email}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Código estudiantil</span>
              <span>{perfil.codigoEstudiantil ?? <em>sin asignar</em>}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Carrera</span>
              <span>{perfil.carrera ? `${perfil.carrera.nombre} (${perfil.carrera.codigo})` : <em>sin asignar</em>}</span>
            </div>
            <div className="field-row">
              <span className="field-label">Plantilla de malla</span>
              <span>
                {perfil.plantilla ? `${perfil.plantilla.nombre} · v${perfil.plantilla.version}` : <em>sin asignar</em>}
              </span>
            </div>
            <div className="field-row">
              <span className="field-label">Semestre sugerido</span>
              <span>{perfil.semestreSugerido}</span>
            </div>
          </section>

          <section className="panel">
            <h2>Avance académico</h2>
            <DonutChart
              percentage={perfil.avance.porcentajeMallaCompletada}
              label={
                <>
                  Malla obligatoria completada
                  <br />
                  {perfil.avance.unidadesValorativasAprobadasObligatorias} /{' '}
                  {perfil.avance.unidadesValorativasTotalesObligatorias} U.V.
                </>
              }
            />
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(100, perfil.avance.porcentajeMallaCompletada)}%` }}
              />
            </div>
            <p>
              Unidades valorativas totales aprobadas (incluye electivas): {perfil.avance.unidadesValorativasAprobadas}
            </p>
          </section>

          <nav className="inline-form">
            <Link to="/estudiante/historial" className="btn btn-secondary">
              Ver historial de clases
            </Link>
            <Link to="/estudiante/malla" className="btn btn-primary">
              Seleccionar clases a cursar
            </Link>
            <Link to="/estudiante/pensum" className="btn btn-secondary">
              Pensum
            </Link>
          </nav>
        </>
      )}
    </AppShell>
  );
}
