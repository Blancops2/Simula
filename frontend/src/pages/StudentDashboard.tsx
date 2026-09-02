import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { actualizarPerfil, getPerfil } from '../api/estudianteApi';
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

  const [editando, setEditando] = useState(false);
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [codigoEstudiantil, setCodigoEstudiantil] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  useEffect(() => {
    getPerfil()
      .then(setPerfil)
      .catch(() => setError('No se pudo cargar tu perfil.'))
      .finally(() => setLoading(false));
  }, []);

  function iniciarEdicion() {
    setNombreCompleto(perfil?.nombreCompleto ?? '');
    setCodigoEstudiantil(perfil?.codigoEstudiantil ?? '');
    setErrorGuardado(null);
    setEditando(true);
  }

  async function handleGuardar(event: FormEvent) {
    event.preventDefault();
    setGuardando(true);
    setErrorGuardado(null);
    try {
      await actualizarPerfil({ nombreCompleto, codigoEstudiantil });
      const actualizado = await getPerfil();
      setPerfil(actualizado);
      setEditando(false);
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { message?: string | string[] } } };
      const status = axiosError.response?.status;
      const message = axiosError.response?.data?.message;
      if (status === 409) {
        setErrorGuardado(typeof message === 'string' ? message : 'Ese código estudiantil ya está en uso.');
      } else if (status === 400) {
        setErrorGuardado(Array.isArray(message) ? message.join(' ') : message ?? 'Revisa los datos ingresados.');
      } else {
        setErrorGuardado('No se pudo guardar tu perfil.');
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell title="Mi perfil">
      {loading && <p>Cargando…</p>}
      {error && <p className="page-error">{error}</p>}

      {perfil && (
        <>
          {(!perfil.nombreCompleto || !perfil.codigoEstudiantil) && (
            <p className="page-warning">
              Tu información básica está incompleta ({!perfil.nombreCompleto && 'nombre completo'}
              {!perfil.nombreCompleto && !perfil.codigoEstudiantil && ', '}
              {!perfil.codigoEstudiantil && 'código estudiantil'}). Contacta al administrador para completarla.
            </p>
          )}

          <section className="panel">
            <div className="panel-header">
              <h2>{perfil.nombreCompleto ?? user?.email}</h2>
              {!editando && (
                <button className="btn btn-secondary btn-sm" onClick={iniciarEdicion}>
                  Editar
                </button>
              )}
            </div>

            {editando ? (
              <form onSubmit={handleGuardar}>
                {errorGuardado && <p className="page-error">{errorGuardado}</p>}
                <label className="field">
                  Nombre completo
                  <input
                    value={nombreCompleto}
                    onChange={(e) => setNombreCompleto(e.target.value)}
                    required
                  />
                </label>
                <label className="field" style={{ marginTop: 10 }}>
                  Código estudiantil
                  <input
                    value={codigoEstudiantil}
                    onChange={(e) => setCodigoEstudiantil(e.target.value)}
                    required
                  />
                </label>
                <div className="inline-form" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={guardando}
                    onClick={() => setEditando(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className={`btn btn-primary ${guardando ? 'btn-loading' : ''}`}
                    disabled={guardando}
                  >
                    Guardar cambios
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="field-row">
                  <span className="field-label">Correo</span>
                  <span>{perfil.email}</span>
                </div>
                <div className="field-row">
                  <span className="field-label">Código estudiantil</span>
                  <span>{perfil.codigoEstudiantil ?? <em>sin asignar</em>}</span>
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <h2>Información académica</h2>
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
