import { useCallback, useEffect, useState } from 'react';
import { cancelarInscripcion, getInscripciones, getMalla, inscribirClases } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import type { ClaseConEstado, InscripcionItem, MallaConEstado } from '../estudiante/types';

const ETIQUETAS_ESTADO: Record<ClaseConEstado['estadoEstudiante'], string> = {
  APROBADA: 'Aprobada',
  EN_CURSO: 'En curso',
  DISPONIBLE: 'Disponible',
  BLOQUEADA: 'Bloqueada',
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function SeleccionClasesPage() {
  const [malla, setMalla] = useState<MallaConEstado | null>(null);
  const [inscripciones, setInscripciones] = useState<InscripcionItem[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mallaRes, inscripcionesRes] = await Promise.all([getMalla(), getInscripciones()]);
      setMalla(mallaRes);
      setInscripciones(inscripcionesRes);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar la malla curricular.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const idsInscritos = new Set(inscripciones.map((i) => i.clase.id));

  function toggleSeleccion(claseId: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(claseId)) next.delete(claseId);
      else next.add(claseId);
      return next;
    });
  }

  async function onInscribir() {
    if (seleccion.size === 0) return;
    setEnviando(true);
    setError(null);
    setMensaje(null);
    try {
      await inscribirClases([...seleccion]);
      setSeleccion(new Set());
      setMensaje('Inscripción realizada correctamente.');
      await cargar();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo completar la inscripción.'));
    } finally {
      setEnviando(false);
    }
  }

  async function onCancelar(inscripcionId: string) {
    setError(null);
    try {
      await cancelarInscripcion(inscripcionId);
      await cargar();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cancelar la inscripción.'));
    }
  }

  if (loading) {
    return (
      <AppShell title="Seleccionar clases a cursar" backTo="/estudiante" backLabel="Mi perfil">
        <p>Cargando…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Seleccionar clases a cursar" backTo="/estudiante" backLabel="Mi perfil">
      {error && <p className="page-error">{error}</p>}
      {mensaje && <p className="page-success">{mensaje}</p>}

      {inscripciones.length > 0 && (
        <section className="panel">
          <h2>Ya inscritas este período ({inscripciones[0]?.periodo})</h2>
          <ul className="student-list">
            {inscripciones.map((i) => (
              <li key={i.id}>
                <span>
                  {i.clase.codigo} — {i.clase.nombre} ({i.clase.unidadesValorativas} U.V.)
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => onCancelar(i.id)}>
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!malla ? (
        <p>No se pudo cargar tu malla curricular.</p>
      ) : (
        <>
          <section className="tree">
            {malla.niveles.map((n) => (
              <div key={n.nivel} className="tree-level">
                <h3 className="tree-level-title">Nivel {n.nivel}</h3>
                <div className="tree-nodes">
                  {n.clases.map((clase) => {
                    const inscrita = idsInscritos.has(clase.id);
                    const seleccionable = clase.estadoEstudiante === 'DISPONIBLE' && !inscrita;
                    return (
                      <div
                        key={clase.id}
                        className={`tree-node tree-node-${clase.estadoEstudiante.toLowerCase()}`}
                      >
                        <div className="tree-node-title">
                          <strong>{clase.codigo}</strong> — {clase.nombre}
                          <span className={`badge status-${clase.estadoEstudiante.toLowerCase()}`}>
                            {inscrita ? 'Inscrita' : ETIQUETAS_ESTADO[clase.estadoEstudiante]}
                          </span>
                        </div>
                        <div className="tree-node-meta">
                          {clase.unidadesValorativas} U.V. ·{' '}
                          {clase.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Electiva'}
                        </div>

                        {clase.prerrequisitos.length > 0 && (
                          <div className="tree-node-meta">
                            Prerrequisitos: {clase.prerrequisitos.map((p) => p.codigo).join(', ')}
                          </div>
                        )}
                        {clase.correquisitos.length > 0 && (
                          <div className="tree-node-meta">
                            Correquisitos: {clase.correquisitos.map((p) => p.codigo).join(', ')}
                          </div>
                        )}
                        {clase.estadoEstudiante === 'BLOQUEADA' && (
                          <div className="tree-node-meta" style={{ color: 'var(--color-danger)' }}>
                            Te falta aprobar: {clase.prerrequisitosFaltantes.map((p) => p.codigo).join(', ')}
                          </div>
                        )}

                        {seleccionable && (
                          <label className="tree-node-checkbox">
                            <input
                              type="checkbox"
                              checked={seleccion.has(clase.id)}
                              onChange={() => toggleSeleccion(clase.id)}
                            />
                            Seleccionar
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <button
            className={`btn btn-primary ${enviando ? 'btn-loading' : ''}`}
            disabled={seleccion.size === 0 || enviando}
            onClick={onInscribir}
          >
            {enviando ? 'Inscribiendo…' : `Inscribir seleccionadas (${seleccion.size})`}
          </button>
        </>
      )}
    </AppShell>
  );
}
