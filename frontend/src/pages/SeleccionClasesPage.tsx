import { useCallback, useEffect, useMemo, useState } from 'react';
import { cancelarInscripcion, getInscripciones, getMalla, getPeriodosDisponibles, inscribirClases } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import type { InscripcionItem, MallaConEstado, PeriodoDisponible } from '../estudiante/types';

// HU-03-04: tope de unidades valorativas por matrícula. Cuenta tanto lo que
// el estudiante ya tiene inscrito en el período elegido (otra pestaña,
// sesión anterior) como lo que va marcando ahora, para que no pueda rodear
// el tope inscribiendo en tandas.
const MAX_UNIDADES_VALORATIVAS = 25;

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function etiquetaPeriodo(p: { anno: string; periodo: string }): string {
  return `${p.anno} - Período ${p.periodo}`;
}

export function SeleccionClasesPage() {
  const [malla, setMalla] = useState<MallaConEstado | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoDisponible[]>([]);
  const [periodoId, setPeriodoId] = useState<string>('');
  // Elección en el <select>, todavía no aplicada: separada de `periodoId`
  // (el período realmente activo para el tope de U.V. y para matricular) a
  // propósito, para que cambiar el <select> no dispare nada por sí solo —
  // solo el botón "Cambiar período" aplica el cambio.
  const [periodoIdBorrador, setPeriodoIdBorrador] = useState<string>('');
  const [inscripciones, setInscripciones] = useState<InscripcionItem[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cambiandoPeriodo, setCambiandoPeriodo] = useState(false);
  const [inscribiendo, setInscribiendo] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  // Las clases se muestran de inmediato (no dependen de elegir un período
  // primero): el período solo se necesita al final, cuando el estudiante ya
  // eligió qué matricular y hace clic en "Hacer inscripción".
  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const [mallaData, periodosData, inscripcionesData] = await Promise.all([
          getMalla(),
          getPeriodosDisponibles(),
          getInscripciones(),
        ]);
        setMalla(mallaData);
        setPeriodos(periodosData);
        setPeriodoId(periodosData[0]?.id ?? '');
        setPeriodoIdBorrador(periodosData[0]?.id ?? '');
        setInscripciones(inscripcionesData);
      } catch (err) {
        setError(errorMessage(err, 'No se pudo cargar la información de matrícula.'));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  // Agrupa las inscripciones vigentes por período para la tabla de resumen
  // de más abajo. Solo se agrupan períodos que el estudiante realmente
  // llenó (tienen al menos una inscripción); no se muestra un grupo vacío
  // por cada período habilitado.
  const inscripcionesPorPeriodo = useMemo(() => {
    const grupos = new Map<string, { periodoId: string; periodo: string; items: InscripcionItem[] }>();
    inscripciones.forEach((i) => {
      const grupo = grupos.get(i.periodoId) ?? { periodoId: i.periodoId, periodo: i.periodo, items: [] };
      grupo.items.push(i);
      grupos.set(i.periodoId, grupo);
    });
    return [...grupos.values()].sort((a, b) => b.periodo.localeCompare(a.periodo));
  }, [inscripciones]);

  const inscripcionPorClaseId = useMemo(() => {
    const mapa = new Map<string, InscripcionItem>();
    inscripciones.forEach((i) => mapa.set(i.clase.id, i));
    return mapa;
  }, [inscripciones]);

  const nivelesDisponibles = useMemo(
    () =>
      (malla?.niveles ?? [])
        .map((n) => ({ nivel: n.nivel, clases: n.clases.filter((c) => c.estadoEstudiante === 'DISPONIBLE') }))
        .filter((n) => n.clases.length > 0),
    [malla],
  );
  const unidadesValorativasPorId = useMemo(() => {
    const mapa = new Map<string, number>();
    nivelesDisponibles.forEach((n) => n.clases.forEach((c) => mapa.set(c.id, c.unidadesValorativas)));
    return mapa;
  }, [nivelesDisponibles]);

  // El tope de 25 U.V. es por período: solo cuenta lo ya inscrito EN el
  // período que el estudiante tiene elegido ahora mismo para matricular.
  const uvYaInscritas = inscripciones
    .filter((i) => i.periodoId === periodoId)
    .reduce((total, i) => total + i.clase.unidadesValorativas, 0);
  const uvSeleccionadas = [...seleccion].reduce((total, id) => total + (unidadesValorativasPorId.get(id) ?? 0), 0);
  const uvTotal = uvYaInscritas + uvSeleccionadas;

  const alternarSeleccion = useCallback(
    (claseId: string, unidadesValorativas: number, marcar: boolean) => {
      setSeleccion((prev) => {
        const siguiente = new Set(prev);
        if (marcar) {
          if (uvTotal + unidadesValorativas > MAX_UNIDADES_VALORATIVAS) {
            return prev;
          }
          siguiente.add(claseId);
        } else {
          siguiente.delete(claseId);
        }
        return siguiente;
      });
    },
    [uvTotal],
  );

  const hacerInscripcion = useCallback(async () => {
    if (seleccion.size === 0 || !periodoId) {
      return;
    }
    setInscribiendo(true);
    setError(null);
    setMensajeExito(null);
    try {
      // El backend revalida en este momento que el período elegido siga
      // existiendo y habilitado (pudo cambiar de estado mientras el
      // estudiante seleccionaba clases); si no, responde con un error claro
      // que se muestra abajo en vez de dejar avanzar la inscripción.
      const actualizadas = await inscribirClases(periodoId, [...seleccion]);
      setInscripciones(actualizadas);
      setSeleccion(new Set());
      setMensajeExito('Inscripción realizada correctamente.');
    } catch (err) {
      setError(errorMessage(err, 'No se pudo completar la inscripción.'));
      // El error más probable en este punto es que el período elegido dejó
      // de estar habilitado entre que se cargó la página y este clic: se
      // refresca la lista de períodos para que el <select> deje de
      // ofrecerlo (AC2 — el cambio de estado se refleja en el siguiente
      // refresco, no solo si el estudiante recarga la página entera).
      try {
        setPeriodos(await getPeriodosDisponibles());
      } catch {
        // Si ni siquiera se puede refrescar la lista, se deja el error de
        // arriba tal cual: no tiene sentido pisarlo con uno secundario.
      }
    } finally {
      setInscribiendo(false);
    }
  }, [seleccion, periodoId]);

  // Aplica el período elegido en el <select> (solo si de verdad cambió) y
  // "recarga": descarta la selección pendiente (las U.V. ya marcadas eran
  // relativas al período anterior, no tiene sentido arrastrarlas a uno
  // nuevo), refresca la lista de períodos habilitados y las inscripciones
  // vigentes por si algo cambió mientras tanto (otra pestaña, un admin
  // deshabilitando el período, etc. — AC2).
  const cambiarPeriodo = useCallback(async () => {
    if (!periodoIdBorrador || periodoIdBorrador === periodoId) {
      return;
    }
    setCambiandoPeriodo(true);
    setError(null);
    setMensajeExito(null);
    try {
      const [periodosData, inscripcionesData] = await Promise.all([getPeriodosDisponibles(), getInscripciones()]);
      setPeriodos(periodosData);
      // El período elegido en el <select> pudo dejar de estar habilitado
      // justo mientras se refrescaba: si ya no aparece en la lista fresca,
      // no se aplica (se avisa y se mantiene el período activo anterior).
      if (!periodosData.some((p) => p.id === periodoIdBorrador)) {
        setPeriodoIdBorrador(periodoId);
        setError('El período elegido ya no está habilitado. Elige otro de la lista actualizada.');
        return;
      }
      setPeriodoId(periodoIdBorrador);
      setInscripciones(inscripcionesData);
      setSeleccion(new Set());
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar de período.'));
    } finally {
      setCambiandoPeriodo(false);
    }
  }, [periodoId, periodoIdBorrador]);

  const cancelarClase = useCallback(async (inscripcionId: string) => {
    setCancelandoId(inscripcionId);
    setError(null);
    setMensajeExito(null);
    try {
      await cancelarInscripcion(inscripcionId);
      setInscripciones((prev) => prev.filter((i) => i.id !== inscripcionId));
      setMensajeExito('Inscripción cancelada.');
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cancelar la inscripción.'));
    } finally {
      setCancelandoId(null);
    }
  }, []);

  if (cargando) {
    return (
      <AppShell title="Inscripción" backTo="/estudiante" backLabel="Mi perfil">
        <p>Cargando…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Inscripción" backTo="/estudiante" backLabel="Mi perfil">
      {error && <p className="page-error">{error}</p>}
      {mensajeExito && <p className="page-success">{mensajeExito}</p>}

      {malla && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Catálogo de asignaturas</h2>
              <p className="tree-node-meta">Plan de estudios: {malla.plantilla.nombre}</p>
            </div>
            <div className="panel-header-actions">
              <label className="field">
                Período para matricular
                {periodos.length === 0 ? (
                  <span className="tree-node-meta">No hay períodos habilitados.</span>
                ) : (
                  <select value={periodoIdBorrador} onChange={(e) => setPeriodoIdBorrador(e.target.value)}>
                    {periodos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {etiquetaPeriodo(p)}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              {periodos.length > 0 && (
                <button
                  type="button"
                  className="btn btn-catalog-blue btn-sm"
                  onClick={cambiarPeriodo}
                  disabled={periodoIdBorrador === periodoId || cambiandoPeriodo}
                >
                  {cambiandoPeriodo ? 'Cambiando…' : 'Cambiar período'}
                </button>
              )}
              <span className={`badge ${uvTotal >= MAX_UNIDADES_VALORATIVAS ? 'badge-warning' : 'badge-neutral'}`}>
                {uvTotal} / {MAX_UNIDADES_VALORATIVAS} U.V. seleccionadas
              </span>
              <button
                type="button"
                className="btn btn-catalog-blue"
                onClick={hacerInscripcion}
                disabled={seleccion.size === 0 || !periodoId || inscribiendo || cambiandoPeriodo}
              >
                {inscribiendo ? 'Inscribiendo…' : 'Hacer inscripción'}
              </button>
            </div>
          </div>

          {nivelesDisponibles.length === 0 ? (
            <p>No tienes asignaturas disponibles para matricular en este momento.</p>
          ) : (
            <div className="catalog-scroll">
              <section className="tree">
                {nivelesDisponibles.map((n) => (
                  <div key={n.nivel} className="tree-level">
                    <h3 className="tree-level-title">Nivel {n.nivel}</h3>
                    <div className="tree-nodes">
                      {n.clases.map((clase) => {
                        const inscripcion = inscripcionPorClaseId.get(clase.id);
                        // Inscrita en OTRO período (no el que se tiene activo ahora mismo):
                        // se ve gris/apagada y no admite ninguna acción directa desde la
                        // tarjeta (ni seleccionarla ni cancelarla) — para eso está la tabla
                        // "Mis inscripciones" de más abajo. Inscrita en el período activo,
                        // o sin inscribir todavía, se trata igual que antes (tarjeta
                        // amarilla): solo cambia que ya no se puede cancelar desde aquí.
                        const inscritaEnOtroPeriodo = !!inscripcion && inscripcion.periodoId !== periodoId;
                        const marcada = seleccion.has(clase.id);
                        const superaTope =
                          !marcada && !inscripcion && uvTotal + clase.unidadesValorativas > MAX_UNIDADES_VALORATIVAS;
                        return (
                          <div
                            key={clase.id}
                            className={`tree-node ${inscritaEnOtroPeriodo ? 'tree-node-otro-periodo' : 'tree-node-disponible'}`}
                          >
                            <div className="tree-node-title">
                              <strong>{clase.codigo}</strong> — {clase.nombre}
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

                            {inscripcion ? (
                              <span className={`badge ${inscritaEnOtroPeriodo ? 'badge-neutral' : 'badge-success'}`}>
                                Ya inscrita — {inscripcion.periodo}
                              </span>
                            ) : (
                              <label className="tree-node-checkbox">
                                <input
                                  type="checkbox"
                                  checked={marcada}
                                  disabled={superaTope}
                                  onChange={(e) =>
                                    alternarSeleccion(clase.id, clase.unidadesValorativas, e.target.checked)
                                  }
                                />
                                {superaTope ? 'Supera el tope de 25 U.V.' : 'Seleccionar para matricular'}
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}
        </section>
      )}

      {inscripcionesPorPeriodo.length > 0 && (
        <section className="panel">
          <h2>Mis inscripciones</h2>
          {inscripcionesPorPeriodo.map((grupo) => (
            <div key={grupo.periodoId} className="tree-level">
              <h3 className="tree-level-title">Período {grupo.periodo}</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Clase</th>
                      <th>Nivel</th>
                      <th>U.V.</th>
                      <th>Tipo</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.clase.codigo}</td>
                        <td>{i.clase.nombre}</td>
                        <td>{i.clase.nivel}</td>
                        <td>{i.clase.unidadesValorativas}</td>
                        <td>{i.clase.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Electiva'}</td>
                        <td className="table-actions">
                          <button
                            type="button"
                            className="btn btn-catalog-blue btn-sm"
                            onClick={() => cancelarClase(i.id)}
                            disabled={cancelandoId === i.id}
                          >
                            {cancelandoId === i.id ? 'Cancelando…' : 'Cancelar inscripción'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      )}
    </AppShell>
  );
}
