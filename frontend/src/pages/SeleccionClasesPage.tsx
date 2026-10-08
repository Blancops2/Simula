import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelarInscripcion,
  getInscripciones,
  getMalla,
  getPeriodosDisponibles,
  getRecomendacionClases,
  getRecomendacionPeriodo,
  getResumenAcademico,
  inscribirClases,
  simularCarga,
} from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import type {
  FallaPrediccion,
  InscripcionItem,
  MallaConEstado,
  NivelRiesgo,
  PeriodoDisponible,
  RecomendacionClases,
  RecomendacionPeriodo,
  ResumenAcademico,
  SimulacionCarga,
} from '../estudiante/types';

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

const RIESGO_UI: Record<NivelRiesgo, { etiqueta: string; badge: string }> = {
  BAJO: { etiqueta: 'Riesgo bajo', badge: 'badge-success' },
  MEDIO: { etiqueta: 'Riesgo medio', badge: 'badge-warning' },
  ALTO: { etiqueta: 'Riesgo alto', badge: 'badge-danger' },
};

const MENSAJE_FALLA_SIMULACION: Record<FallaPrediccion, string> = {
  NO_CONFIGURADO: 'La simulación con el modelo predictivo todavía no está disponible.',
  CARRERA_NO_SOPORTADA: 'El modelo predictivo todavía no cubre tu carrera.',
  NO_DISPONIBLE: 'No se pudo simular la carga en este momento. Intenta de nuevo más tarde.',
};

const MENSAJE_FALLA_RECOMENDACION: Record<FallaPrediccion, string> = {
  NO_CONFIGURADO: 'La recomendación del modelo predictivo todavía no está disponible.',
  CARRERA_NO_SOPORTADA: 'El modelo predictivo todavía no cubre tu carrera.',
  NO_DISPONIBLE: 'No se pudo obtener la recomendación en este momento. Intenta de nuevo más tarde.',
};

// HU-04-08: estado de la simulación de un período. `firma` = inscripciones
// del período con que se pidió (ver `inscripcionesPorPeriodo`).
interface SimulacionPeriodoUI {
  firma: string;
  cargando: boolean;
  resultado: SimulacionCarga | null;
  error: string | null;
}

function porcentaje(probabilidad: number): string {
  return `${Math.round(probabilidad * 100)}%`;
}

// Normaliza para comparar sin distinguir mayúsculas/minúsculas ni acentos
// (para que "programacion" encuentre "Programación").
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function SeleccionClasesPage() {
  const [malla, setMalla] = useState<MallaConEstado | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoDisponible[]>([]);
  const [periodoId, setPeriodoId] = useState<string>('');
  const [inscripciones, setInscripciones] = useState<InscripcionItem[]>([]);
  // null = todavía cargando; un error de red se trata como "no disponible".
  const [recoClases, setRecoClases] = useState<RecomendacionClases | null>(null);
  const [errorRecoClases, setErrorRecoClases] = useState(false);
  const [recoPeriodo, setRecoPeriodo] = useState<RecomendacionPeriodo>({ periodo: null, completado: false });
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  // HU-04-02: búsqueda por texto libre dentro del catálogo de asignaturas
  // disponibles para matricular en el período seleccionado.
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [inscribiendo, setInscribiendo] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  // HU-04-06 (ampliación): tras un "Hacer inscripción" exitoso, el panel
  // flotante muestra este mensaje en vez de la lista, y se cierra solo
  // (sin que el estudiante tenga que hacer nada) 2 segundos después.
  const [exitoCargaVisible, setExitoCargaVisible] = useState(false);
  const exitoCargaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // HU-04-08: simulación de la carga INSCRITA (probabilidad de aprobar toda
  // la carga y cada clase), por período, desde "Mis inscripciones". Lo
  // marcado en el catálogo sin inscribir no se simula. Cada resultado guarda
  // la firma de las inscripciones con que se pidió: si después se inscribe o
  // cancela una clase de ese período, deja de coincidir y el resultado (o
  // uno que llegue tarde) ya no se muestra.
  const [simulaciones, setSimulaciones] = useState<Record<string, SimulacionPeriodoUI>>({});
  // Información académica que usará la simulación (carrera, U.V. aprobadas,
  // índice). El backend la calcula del historial en cada consulta; se pide
  // al abrir la ventana de inscripción y aparte de la carga inicial, para que
  // una falla aquí no impida inscribir.
  const [resumenAcademico, setResumenAcademico] = useState<ResumenAcademico | null>(null);
  const [errorResumenAcademico, setErrorResumenAcademico] = useState(false);

  useEffect(
    () => () => {
      if (exitoCargaTimeoutRef.current) {
        clearTimeout(exitoCargaTimeoutRef.current);
      }
    },
    [],
  );

  // Las clases se muestran de inmediato (no dependen de elegir un período
  // primero): el período solo se necesita al final, cuando el estudiante ya
  // eligió qué matricular y hace clic en "Hacer inscripción".
  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const [mallaData, periodosData, inscripcionesData, recoPeriodoData] = await Promise.all([
          getMalla(),
          getPeriodosDisponibles(),
          getInscripciones(),
          getRecomendacionPeriodo(),
        ]);
        setMalla(mallaData);
        setPeriodos(periodosData);
        setPeriodoId(periodosData[0]?.id ?? '');
        setInscripciones(inscripcionesData);
        setRecoPeriodo(recoPeriodoData);
      } catch (err) {
        setError(errorMessage(err, 'No se pudo cargar la información de matrícula.'));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  useEffect(() => {
    let vigente = true;
    getResumenAcademico()
      .then((data) => vigente && setResumenAcademico(data))
      .catch(() => vigente && setErrorResumenAcademico(true));
    return () => {
      vigente = false;
    };
  }, []);

  // La carga recomendada depende del período elegido (el modelo considera
  // lo ya inscrito en él) y de las inscripciones vigentes, así que se recarga
  // cuando cambia cualquiera de los dos. Va aparte de la carga inicial para
  // que una falla del modelo no impida usar el resto de la página.
  useEffect(() => {
    if (cargando) {
      return;
    }
    let vigente = true;
    setRecoClases(null);
    setErrorRecoClases(false);
    getRecomendacionClases(periodoId || undefined)
      .then((data) => vigente && setRecoClases(data))
      .catch(() => vigente && setErrorRecoClases(true));
    return () => {
      vigente = false;
    };
  }, [cargando, periodoId, inscripciones]);

  // Agrupa las inscripciones vigentes por período para la tabla de resumen
  // de más abajo. Solo se agrupan períodos que el estudiante realmente
  // llenó (tienen al menos una inscripción); no se muestra un grupo vacío
  // por cada período habilitado.
  const inscripcionesPorPeriodo = useMemo(() => {
    const grupos = new Map<string, { periodoId: string; periodo: string; items: InscripcionItem[]; totalUv: number }>();
    inscripciones.forEach((i) => {
      const grupo = grupos.get(i.periodoId) ?? { periodoId: i.periodoId, periodo: i.periodo, items: [], totalUv: 0 };
      grupo.items.push(i);
      grupo.totalUv += i.clase.unidadesValorativas;
      grupos.set(i.periodoId, grupo);
    });
    // firma: identifica la carga inscrita exacta del período, para saber si
    // una simulación sigue correspondiendo a ella (HU-04-08).
    return [...grupos.values()]
      .map((g) => ({ ...g, firma: g.items.map((i) => i.id).sort().join('|') }))
      .sort((a, b) => b.periodo.localeCompare(a.periodo));
  }, [inscripciones]);

  // Solo se puede simular sobre un período habilitado (el backend lo
  // revalida); getPeriodosDisponibles devuelve justamente esos.
  const periodosHabilitados = useMemo(() => new Set(periodos.map((p) => p.id)), [periodos]);

  const inscripcionPorClaseId = useMemo(() => {
    const mapa = new Map<string, InscripcionItem>();
    inscripciones.forEach((i) => mapa.set(i.clase.id, i));
    return mapa;
  }, [inscripciones]);

  // Período elegido actualmente en el <select>, para mostrarlo también en
  // el panel flotante (HU-04-06 ampliación) — ahí no se ve el encabezado
  // del catálogo, así que el estudiante no tiene otra forma de confirmar
  // para qué período está armando la carga sin desplazarse hacia arriba.
  const periodoActivo = useMemo(() => periodos.find((p) => p.id === periodoId), [periodos, periodoId]);

  const nivelesDisponibles = useMemo(
    () =>
      (malla?.niveles ?? [])
        .map((n) => ({ nivel: n.nivel, clases: n.clases.filter((c) => c.estadoEstudiante === 'DISPONIBLE') }))
        .filter((n) => n.clases.length > 0),
    [malla],
  );
  // Filtra el catálogo de disponibles (ya acotado al período seleccionado)
  // por nombre o código, según lo que el estudiante va escribiendo.
  const nivelesFiltrados = useMemo(() => {
    const q = normalizarTexto(busquedaCatalogo.trim());
    if (!q) {
      return nivelesDisponibles;
    }
    return nivelesDisponibles
      .map((n) => ({
        nivel: n.nivel,
        clases: n.clases.filter(
          (c) => normalizarTexto(c.codigo).includes(q) || normalizarTexto(c.nombre).includes(q),
        ),
      }))
      .filter((n) => n.clases.length > 0);
  }, [nivelesDisponibles, busquedaCatalogo]);

  const claseInfoPorId = useMemo(() => {
    const mapa = new Map<string, { codigo: string; nombre: string; unidadesValorativas: number }>();
    nivelesDisponibles.forEach((n) =>
      n.clases.forEach((c) => mapa.set(c.id, { codigo: c.codigo, nombre: c.nombre, unidadesValorativas: c.unidadesValorativas })),
    );
    return mapa;
  }, [nivelesDisponibles]);

  // El tope de 25 U.V. es por período: solo cuenta lo ya inscrito EN el
  // período que el estudiante tiene elegido ahora mismo para matricular.
  const uvYaInscritas = inscripciones
    .filter((i) => i.periodoId === periodoId)
    .reduce((total, i) => total + i.clase.unidadesValorativas, 0);
  const uvSeleccionadas = [...seleccion].reduce(
    (total, id) => total + (claseInfoPorId.get(id)?.unidadesValorativas ?? 0),
    0,
  );
  const uvTotal = uvYaInscritas + uvSeleccionadas;

  // HU-04-06: detalle (código, nombre, U.V.) de cada asignatura marcada
  // pero todavía sin confirmar, para la ventanita flotante de "carga
  // propuesta" — la lista completa que antes no existía en ningún lugar.
  const seleccionadasInfo = useMemo(
    () =>
      [...seleccion]
        .map((id) => {
          const info = claseInfoPorId.get(id);
          return info ? { id, ...info } : null;
        })
        .filter((x): x is { id: string; codigo: string; nombre: string; unidadesValorativas: number } => x !== null)
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [seleccion, claseInfoPorId],
  );

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

  // HU-04-06 (ampliación): al terminar con éxito, el panel flotante no se
  // cierra de inmediato — pasa a mostrar "Inscripción exitosa" en vez de la
  // lista, y se cierra solo 2 segundos después (ver `exitoCargaVisible`).
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
      setExitoCargaVisible(true);
      if (exitoCargaTimeoutRef.current) {
        clearTimeout(exitoCargaTimeoutRef.current);
      }
      exitoCargaTimeoutRef.current = setTimeout(() => setExitoCargaVisible(false), 2000);
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

  // HU-04-08: el backend toma las inscripciones del período desde la BD,
  // así que solo se manda el período. La respuesta se guarda solo si la
  // simulación en curso para ese período sigue siendo la misma firma.
  const simularPeriodo = useCallback(async (idPeriodo: string, firma: string) => {
    const guardar = (estado: SimulacionPeriodoUI) =>
      setSimulaciones((prev) => (prev[idPeriodo]?.firma === firma ? { ...prev, [idPeriodo]: estado } : prev));
    setSimulaciones((prev) => ({ ...prev, [idPeriodo]: { firma, cargando: true, resultado: null, error: null } }));
    try {
      const resultado = await simularCarga(idPeriodo);
      guardar({ firma, cargando: false, resultado, error: null });
    } catch (err) {
      guardar({ firma, cargando: false, resultado: null, error: errorMessage(err, 'No se pudo simular la carga.') });
    }
  }, []);

  // El <select> aplica el período directamente, sin paso de confirmación
  // intermedio: antes existía un botón "Cambiar período" separado, pero
  // dejaba una ventana confusa donde el <select> ya mostraba el período
  // nuevo sin que "Hacer inscripción" lo estuviera usando todavía (si el
  // estudiante no hacía clic en "Cambiar período", la inscripción se seguía
  // creando en el período anterior). Con un único estado, lo que se ve en
  // el <select> es siempre lo que se usa al matricular. Se descarta la
  // selección pendiente al cambiar (las U.V. ya marcadas eran relativas al
  // período anterior, no tiene sentido arrastrarlas a uno nuevo); la
  // revalidación de que el período siga existiendo/habilitado ya la hace el
  // backend en el momento de "Hacer inscripción" (AC3 de HU-03-04).
  const cambiarPeriodoId = useCallback((nuevoPeriodoId: string) => {
    setPeriodoId(nuevoPeriodoId);
    setSeleccion(new Set());
    setError(null);
    setMensajeExito(null);
  }, []);

  // HU-04-05 (AC4): a diferencia de desmarcar un checkbox pendiente, esto
  // borra una inscripción real sin forma de deshacer — se pide confirmación
  // explícita antes de llamar al backend.
  const cancelarClase = useCallback(async (inscripcion: InscripcionItem) => {
    if (
      !window.confirm(
        `¿Estás seguro de que deseas eliminar esta clase inscrita? ${inscripcion.clase.codigo} - ${inscripcion.clase.nombre}`,
      )
    ) {
      return;
    }
    const inscripcionId = inscripcion.id;
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
                  <select value={periodoId} onChange={(e) => cambiarPeriodoId(e.target.value)}>
                    {periodos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {etiquetaPeriodo(p)}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <span className={`badge ${uvTotal >= MAX_UNIDADES_VALORATIVAS ? 'badge-warning' : 'badge-neutral'}`}>
                {uvTotal} / {MAX_UNIDADES_VALORATIVAS} U.V. seleccionadas
              </span>
              <button
                type="button"
                className="btn btn-catalog-blue"
                onClick={hacerInscripcion}
                disabled={seleccion.size === 0 || !periodoId || inscribiendo}
              >
                {inscribiendo ? 'Inscribiendo…' : 'Hacer inscripción'}
              </button>
            </div>
          </div>

          {nivelesDisponibles.length === 0 ? (
            <p>No tienes asignaturas disponibles para matricular en este momento.</p>
          ) : (
            <>
              <div className="field catalog-search">
                <label htmlFor="busqueda-catalogo">Buscar asignatura</label>
                <input
                  id="busqueda-catalogo"
                  type="text"
                  placeholder="Buscar por nombre o código…"
                  value={busquedaCatalogo}
                  onChange={(e) => setBusquedaCatalogo(e.target.value)}
                />
              </div>

              {nivelesFiltrados.length === 0 ? (
                <p className="tree-node-meta">
                  No se encontraron asignaturas que coincidan con &quot;{busquedaCatalogo.trim()}&quot;.
                </p>
              ) : (
                <div className="catalog-scroll">
                  <section className="tree">
                    {nivelesFiltrados.map((n) => (
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
                              !marcada &&
                              !inscripcion &&
                              uvTotal + clase.unidadesValorativas > MAX_UNIDADES_VALORATIVAS;
                            return (
                              <div
                                key={clase.id}
                                className={`tree-node ${inscritaEnOtroPeriodo ? 'tree-node-otro-periodo' : 'tree-node-disponible'} ${marcada ? 'tree-node-seleccionada' : ''}`}
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
                                  <span
                                    className={`badge ${inscritaEnOtroPeriodo ? 'badge-neutral' : 'badge-success'}`}
                                  >
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
            </>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Recomendaciones</h2>

        {/* Carga completa propuesta por el modelo predictivo (contrato v1.1),
            con la misma estructura que una simulación de "Mis inscripciones".
            Es una alternativa a lo inscrito en el período: solo se muestra;
            si el estudiante quiere usarla, cancela o inscribe a mano. */}
        <div className="tree-level">
          <div className="tree-level-header">
            <h3 className="tree-level-title">
              Carga recomendada para ti
              {recoClases?.periodo ? ` · Período ${recoClases.periodo.anno}-${recoClases.periodo.periodo}` : ''}
            </h3>
            {recoClases?.disponible && recoClases.clases.length > 0 && (
              <span className="badge badge-neutral">
                Unidades valorativas: {recoClases.totalUnidadesValorativas} / {recoClases.limiteUnidadesValorativas}
              </span>
            )}
          </div>
          {errorRecoClases ? (
            <p className="tree-node-meta">{MENSAJE_FALLA_RECOMENDACION.NO_DISPONIBLE}</p>
          ) : !recoClases ? (
            <p className="tree-node-meta">Cargando recomendación…</p>
          ) : !recoClases.disponible ? (
            <p className="tree-node-meta">{MENSAJE_FALLA_RECOMENDACION[recoClases.falla ?? 'NO_DISPONIBLE']}</p>
          ) : recoClases.clases.length === 0 ? (
            <p className="tree-node-meta">No hay clases para recomendarte en este momento.</p>
          ) : (
            <>
              <p className="tree-node-meta">
                Es una propuesta: no modifica tu inscripción. Si quieres seguirla, cancela o inscribe las clases
                manualmente.
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Clase</th>
                      <th>Nivel</th>
                      <th>U.V.</th>
                      <th>Tipo</th>
                      {recoClases.fuente === 'MODELO_EXTERNO' && <th>Probabilidad de aprobar</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {recoClases.clases.map((clase) => (
                      <tr key={clase.id}>
                        <td>{clase.codigo}</td>
                        <td>
                          {clase.nombre}
                          {clase.inscritaEnPeriodo && <span className="badge badge-success reco-inscrita">Ya inscrita</span>}
                          {clase.motivo && <div className="tree-node-meta">{clase.motivo}</div>}
                        </td>
                        <td>{clase.nivel}</td>
                        <td>{clase.unidadesValorativas}</td>
                        <td>{clase.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Electiva'}</td>
                        {recoClases.fuente === 'MODELO_EXTERNO' && (
                          <td>
                            {clase.probabilidadAprobacion !== null && clase.riesgo ? (
                              <>
                                <span className={`badge ${RIESGO_UI[clase.riesgo].badge}`}>
                                  {porcentaje(clase.probabilidadAprobacion)} · {RIESGO_UI[clase.riesgo].etiqueta}
                                </span>
                                {clase.factores.length > 0 && (
                                  <ul className="simulacion-factores">
                                    {clase.factores.map((f) => (
                                      <li key={f}>{f}</li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="simulacion-resultado">
                {recoClases.fuente === 'FALLBACK_LOCAL' ? (
                  <p className="simulacion-aviso">
                    Propuesta básica según tu nivel sugerido. Las probabilidades de aprobación estarán disponibles
                    cuando el modelo predictivo esté conectado.
                  </p>
                ) : recoClases.probabilidadAprobarTodo !== null && recoClases.riesgo ? (
                  <>
                    <div className="simulacion-total">
                      <span>Probabilidad de aprobar toda la carga recomendada</span>
                      <span className={`badge ${RIESGO_UI[recoClases.riesgo].badge}`}>
                        {porcentaje(recoClases.probabilidadAprobarTodo)} · {RIESGO_UI[recoClases.riesgo].etiqueta}
                      </span>
                    </div>
                    {recoClases.observaciones.length > 0 && (
                      <ul className="simulacion-factores">
                        {recoClases.observaciones.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="tree-level">
          <h3 className="tree-level-title">Periodo de tu plan de estudio sugerido</h3>
          {recoPeriodo.completado && !recoPeriodo.periodo ? (
            <p className="tree-node-meta">Tu carrera todavía no tiene un plan de estudio recomendado.</p>
          ) : recoPeriodo.completado ? (
            <p className="tree-node-meta">Has completado tu plan de estudio.</p>
          ) : recoPeriodo.periodo ? (
            <div className="table-scroll">
              <p className="tree-node-meta">
                {recoPeriodo.periodo.anno} - {recoPeriodo.periodo.periodo}
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Clase</th>
                    <th>U.V.</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recoPeriodo.periodo.clases.map((c) => (
                    <tr key={c.id}>
                      <td>{c.codigo}</td>
                      <td>{c.nombre}</td>
                      <td>{c.unidadesValorativas}</td>
                      <td>
                        <span className={`badge status-${c.estadoEstudiante.toLowerCase()}`}>
                          {c.estadoEstudiante}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      {inscripcionesPorPeriodo.length > 0 && (
        <section className="panel">
          <h2>Mis inscripciones</h2>
          <div className="resumen-academico">
            <h3 className="tree-level-title">Tu información académica</h3>
            {errorResumenAcademico ? (
              <p className="tree-node-meta">No se pudo cargar tu información académica.</p>
            ) : !resumenAcademico ? (
              <p className="tree-node-meta">Cargando información académica…</p>
            ) : (
              // Dos líneas: arriba los títulos y abajo, en la misma columna, su valor.
              <div className="resumen-academico-grid">
                <span className="field-label">Carrera</span>
                <span className="field-label">Índice académico</span>
                <span className="field-label">U.V. aprobadas</span>
                <span>
                  {resumenAcademico.carrera ? (
                    `${resumenAcademico.carrera.nombre ?? ''} (${resumenAcademico.carrera.codigo ?? ''})`
                  ) : (
                    <em>sin asignar</em>
                  )}
                </span>
                <span>
                  {resumenAcademico.indiceAcademico !== null ? (
                    resumenAcademico.indiceAcademico.toFixed(2)
                  ) : (
                    <em>sin clases con nota todavía</em>
                  )}
                </span>
                <span>{resumenAcademico.unidadesValorativasAprobadas}</span>
              </div>
            )}
          </div>
          {inscripcionesPorPeriodo.map((grupo) => {
            // Solo se muestra una simulación que corresponda a la carga
            // inscrita actual del período (misma firma).
            const simulacion = simulaciones[grupo.periodoId];
            const vigente = simulacion && simulacion.firma === grupo.firma ? simulacion : null;
            const evaluada = vigente?.resultado?.disponible ? vigente.resultado : null;
            // Se cruza por código: si la inscripción apunta a otra versión
            // de la malla, el backend la simula con la clase de la malla actual.
            const evaluacionPorCodigo = new Map((evaluada?.clases ?? []).map((c) => [c.codigo, c]));
            return (
              <div key={grupo.periodoId} className="tree-level">
                <div className="tree-level-header">
                  <h3 className="tree-level-title">Período {grupo.periodo}</h3>
                  <span className="badge badge-neutral">
                    {grupo.items.length} {grupo.items.length === 1 ? 'asignatura' : 'asignaturas'}
                  </span>
                  <span className={`badge ${grupo.totalUv >= MAX_UNIDADES_VALORATIVAS ? 'badge-warning' : 'badge-neutral'}`}>
                    Unidades valorativas: {grupo.totalUv} / {MAX_UNIDADES_VALORATIVAS}
                  </span>
                  {periodosHabilitados.has(grupo.periodoId) && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => simularPeriodo(grupo.periodoId, grupo.firma)}
                      disabled={vigente?.cargando || cancelandoId !== null}
                    >
                      {vigente?.cargando ? 'Simulando…' : 'Simular carga'}
                    </button>
                  )}
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Clase</th>
                        <th>Nivel</th>
                        <th>U.V.</th>
                        <th>Tipo</th>
                        {evaluada && <th>Probabilidad de aprobar</th>}
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.items.map((i) => {
                        const evaluacionClase = evaluacionPorCodigo.get(i.clase.codigo);
                        return (
                          <tr key={i.id}>
                            <td>{i.clase.codigo}</td>
                            <td>{i.clase.nombre}</td>
                            <td>{i.clase.nivel}</td>
                            <td>{i.clase.unidadesValorativas}</td>
                            <td>{i.clase.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Electiva'}</td>
                            {evaluada && (
                              <td>
                                {evaluacionClase ? (
                                  <>
                                    <span className={`badge ${RIESGO_UI[evaluacionClase.riesgo].badge}`}>
                                      {porcentaje(evaluacionClase.probabilidadAprobacion)} ·{' '}
                                      {RIESGO_UI[evaluacionClase.riesgo].etiqueta}
                                    </span>
                                    {evaluacionClase.factores.length > 0 && (
                                      <ul className="simulacion-factores">
                                        {evaluacionClase.factores.map((f) => (
                                          <li key={f}>{f}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </>
                                ) : (
                                  '—'
                                )}
                              </td>
                            )}
                            <td className="table-actions">
                              <button
                                type="button"
                                className="btn btn-catalog-blue btn-sm"
                                onClick={() => cancelarClase(i)}
                                disabled={cancelandoId === i.id}
                              >
                                {cancelandoId === i.id ? 'Cancelando…' : 'Cancelar inscripción'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {vigente && !vigente.cargando && (
                  <div className="simulacion-resultado" aria-live="polite">
                    {vigente.error ? (
                      <p className="simulacion-aviso">{vigente.error}</p>
                    ) : vigente.resultado && !vigente.resultado.disponible ? (
                      <p className="simulacion-aviso">
                        {MENSAJE_FALLA_SIMULACION[vigente.resultado.falla ?? 'NO_DISPONIBLE']}
                      </p>
                    ) : evaluada && evaluada.probabilidadAprobarTodo !== null && evaluada.riesgo ? (
                      <>
                        <div className="simulacion-total">
                          <span>Probabilidad de aprobar toda la carga</span>
                          <span className={`badge ${RIESGO_UI[evaluada.riesgo].badge}`}>
                            {porcentaje(evaluada.probabilidadAprobarTodo)} · {RIESGO_UI[evaluada.riesgo].etiqueta}
                          </span>
                        </div>
                        {evaluada.observaciones.length > 0 && (
                          <ul className="simulacion-factores">
                            {evaluada.observaciones.map((o) => (
                              <li key={o}>{o}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* HU-04-06: panel flotante con la carga propuesta (asignaturas
          marcadas, aún sin confirmar) — visible solo mientras hay al menos
          una seleccionada, para que el estudiante siempre tenga a la vista
          qué lleva marcado, sin tener que recorrer el catálogo. Se queda
          visible un momento más tras confirmar (`exitoCargaVisible`) para
          mostrar el mensaje de éxito antes de cerrarse solo. */}
      {(seleccionadasInfo.length > 0 || exitoCargaVisible) && (
        <aside className="floating-cart" aria-label="Carga propuesta">
          {exitoCargaVisible ? (
            <div className="floating-cart-success">
              <span className="floating-cart-success-icon" aria-hidden="true">
                ✓
              </span>
              <p>Inscripción exitosa</p>
            </div>
          ) : (
            <>
              <div className="floating-cart-header">
                <div className="floating-cart-header-main">
                  <span>Carga propuesta</span>
                  <span className={`badge ${uvTotal >= MAX_UNIDADES_VALORATIVAS ? 'badge-warning' : 'badge-neutral'}`}>
                    {uvTotal} / {MAX_UNIDADES_VALORATIVAS} U.V.
                  </span>
                </div>
                {/* HU-04-07: contador de asignaturas de la carga propuesta, en
                    su propia línea para no competir por espacio con el badge
                    de U.V.; texto explícito y `aria-live` para que el cambio
                    también se anuncie en lectores de pantalla al agregar o quitar. */}
                <span className="floating-cart-contador" aria-live="polite">
                  {seleccionadasInfo.length}{' '}
                  {seleccionadasInfo.length === 1 ? 'asignatura seleccionada' : 'asignaturas seleccionadas'}
                </span>
                {/* HU-04-06 (ampliación): el período se elige en el encabezado
                    del catálogo, pero esta ventanita queda flotando fuera de
                    ese contexto — se repite aquí para que el estudiante
                    siempre sepa para qué período está armando la carga, sin
                    tener que desplazarse hacia arriba a comprobarlo. */}
                <span className="tree-node-meta floating-cart-periodo">
                  {periodoActivo ? `Período: ${etiquetaPeriodo(periodoActivo)}` : 'Sin período seleccionado'}
                </span>
              </div>
              <ul className="floating-cart-list">
                {seleccionadasInfo.map((c) => (
                  <li key={c.id} className="floating-cart-row">
                    <div className="floating-cart-row-info">
                      <strong>{c.codigo}</strong> — {c.nombre}
                      <span className="tree-node-meta">{c.unidadesValorativas} U.V.</span>
                    </div>
                    <button
                      type="button"
                      className="floating-cart-remove"
                      onClick={() => alternarSeleccion(c.id, c.unidadesValorativas, false)}
                      aria-label={`Quitar ${c.codigo} de la carga propuesta`}
                      title="Quitar de la carga propuesta"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="floating-cart-footer">
                <button
                  type="button"
                  className="btn btn-catalog-blue"
                  onClick={hacerInscripcion}
                  disabled={!periodoId || inscribiendo}
                >
                  {inscribiendo ? 'Inscribiendo…' : 'Hacer inscripción'}
                </button>
              </div>
            </>
          )}
        </aside>
      )}
    </AppShell>
  );
}
