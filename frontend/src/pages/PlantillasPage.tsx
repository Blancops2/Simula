import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createCarrera,
  createPlantilla,
  deletePlantilla,
  duplicarPlantilla,
  listCarreras,
  listEstudiantesDePlantilla,
  listPlantillas,
  updatePlantilla,
} from '../api/curriculumApi';
import { AppShell } from '../components/AppShell';
import type { Carrera, EstudianteResumen, PlantillaResumen } from '../curriculum/types';

export function PlantillasPage() {
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [plantillas, setPlantillas] = useState<PlantillaResumen[]>([]);
  const [carreraFiltro, setCarreraFiltro] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nuevaCarreraNombre, setNuevaCarreraNombre] = useState('');
  const [nuevaCarreraCodigo, setNuevaCarreraCodigo] = useState('');

  const [nuevaPlantillaCarreraId, setNuevaPlantillaCarreraId] = useState('');
  const [nuevaPlantillaNombre, setNuevaPlantillaNombre] = useState('');

  const [estudiantesPorPlantilla, setEstudiantesPorPlantilla] = useState<
    Record<string, EstudianteResumen[]>
  >({});

  const cargar = useCallback(async (carreraId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [carrerasRes, plantillasRes] = await Promise.all([
        listCarreras(),
        listPlantillas(carreraId || undefined),
      ]);
      setCarreras(carrerasRes);
      setPlantillas(plantillasRes);
    } catch {
      setError('No se pudieron cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar(carreraFiltro);
  }, [cargar, carreraFiltro]);

  async function onCrearCarrera(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaCarreraNombre.trim() || !nuevaCarreraCodigo.trim()) return;
    try {
      await createCarrera(nuevaCarreraNombre.trim(), nuevaCarreraCodigo.trim());
      setNuevaCarreraNombre('');
      setNuevaCarreraCodigo('');
      await cargar(carreraFiltro);
    } catch {
      setError('No se pudo crear la carrera. Verifica que el nombre/código no estén en uso.');
    }
  }

  async function onCrearPlantilla(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaPlantillaCarreraId || !nuevaPlantillaNombre.trim()) return;
    try {
      await createPlantilla(nuevaPlantillaCarreraId, nuevaPlantillaNombre.trim());
      setNuevaPlantillaNombre('');
      await cargar(carreraFiltro);
    } catch {
      setError('No se pudo crear la plantilla. Verifica que el nombre no esté repetido en esa carrera.');
    }
  }

  async function onToggleActiva(plantilla: PlantillaResumen) {
    try {
      await updatePlantilla(plantilla.id, { activa: !plantilla.activa });
      await cargar(carreraFiltro);
    } catch {
      setError('No se pudo actualizar el estado de la plantilla.');
    }
  }

  async function onDuplicar(plantilla: PlantillaResumen) {
    const nombre = window.prompt(
      'Nombre para la nueva versión (dejar vacío para reutilizar el nombre actual):',
      plantilla.nombre,
    );
    if (nombre === null) return;
    try {
      await duplicarPlantilla(plantilla.id, nombre.trim() || undefined);
      await cargar(carreraFiltro);
    } catch {
      setError('No se pudo duplicar la plantilla.');
    }
  }

  async function onEliminar(plantilla: PlantillaResumen) {
    if (!window.confirm(`¿Eliminar la plantilla "${plantilla.nombre}" v${plantilla.version}?`)) return;
    try {
      await deletePlantilla(plantilla.id);
      await cargar(carreraFiltro);
    } catch (err: unknown) {
      const mensaje =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No se pudo eliminar la plantilla.';
      setError(mensaje);
    }
  }

  async function onVerEstudiantes(plantillaId: string) {
    if (estudiantesPorPlantilla[plantillaId]) {
      setEstudiantesPorPlantilla((prev) => {
        const next = { ...prev };
        delete next[plantillaId];
        return next;
      });
      return;
    }
    try {
      const estudiantes = await listEstudiantesDePlantilla(plantillaId);
      setEstudiantesPorPlantilla((prev) => ({ ...prev, [plantillaId]: estudiantes }));
    } catch {
      setError('No se pudo cargar la lista de estudiantes.');
    }
  }

  return (
    <AppShell title="Plantillas de malla curricular" backTo="/admin" backLabel="Panel">
      {error && <p className="page-error">{error}</p>}

      <section className="panel">
        <h2>Carreras</h2>
        <form className="inline-form inline-form-end" onSubmit={onCrearCarrera}>
          <label className="field">
            Nombre
            <input
              placeholder="p. ej. Ingeniería de Sistemas"
              value={nuevaCarreraNombre}
              onChange={(e) => setNuevaCarreraNombre(e.target.value)}
            />
          </label>
          <label className="field">
            Código
            <input
              placeholder="p. ej. ISIS"
              value={nuevaCarreraCodigo}
              onChange={(e) => setNuevaCarreraCodigo(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Crear carrera
          </button>
        </form>

        <label className="field" style={{ marginTop: 16, maxWidth: 320 }}>
          Filtrar por carrera
          <select value={carreraFiltro} onChange={(e) => setCarreraFiltro(e.target.value)}>
            <option value="">Todas las carreras</option>
            {carreras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.codigo})
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel">
        <h2>Nueva plantilla</h2>
        <form className="inline-form inline-form-end" onSubmit={onCrearPlantilla}>
          <label className="field">
            Carrera
            <select
              value={nuevaPlantillaCarreraId}
              onChange={(e) => setNuevaPlantillaCarreraId(e.target.value)}
            >
              <option value="">Selecciona una carrera</option>
              {carreras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Nombre de la plantilla
            <input
              placeholder="p. ej. Malla 2026"
              value={nuevaPlantillaNombre}
              onChange={(e) => setNuevaPlantillaNombre(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Crear plantilla
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Plantillas existentes</h2>
        {loading ? (
          <p>Cargando…</p>
        ) : plantillas.length === 0 ? (
          <p>No hay plantillas registradas todavía.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Carrera</th>
                  <th>Nombre</th>
                  <th>Versión</th>
                  <th>Estado</th>
                  <th>Clases</th>
                  <th>Estudiantes</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {plantillas.map((p) => (
                  <Fragment key={p.id}>
                    <tr>
                      <td>{p.carrera.nombre}</td>
                      <td>{p.nombre}</td>
                      <td>v{p.version}</td>
                      <td>
                        <span className={`badge ${p.activa ? 'badge-success' : 'badge-neutral'}`}>
                          {p.activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td>{p._count.clases}</td>
                      <td>
                        <button className="link-btn" onClick={() => onVerEstudiantes(p.id)}>
                          {p._count.estudiantes}
                        </button>
                      </td>
                      <td className="table-actions">
                        <Link to={`/admin/plantillas/${p.id}`} className="btn btn-secondary btn-sm">
                          Editar árbol
                        </Link>
                        <button className="btn btn-secondary btn-sm" onClick={() => onToggleActiva(p)}>
                          {p.activa ? 'Desactivar' : 'Activar'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => onDuplicar(p)}>
                          Duplicar
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => onEliminar(p)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                    {estudiantesPorPlantilla[p.id] && (
                      <tr>
                        <td colSpan={7}>
                          {estudiantesPorPlantilla[p.id].length === 0 ? (
                            <em>Ningún estudiante asignado a esta plantilla.</em>
                          ) : (
                            <ul className="student-list">
                              {estudiantesPorPlantilla[p.id].map((e) => (
                                <li key={e.id}>{e.email}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
