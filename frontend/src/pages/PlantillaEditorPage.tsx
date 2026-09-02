import {
  Background,
  ControlButton,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStoreApi,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { addClase, addRequisito, deleteClase, deleteRequisito, getPlantillaArbol, updateClase } from '../api/curriculumApi';
import { AppShell } from '../components/AppShell';
import { ClaseEditModal } from '../components/curriculum/ClaseEditModal';
import { ClaseFormFields, type ClaseFormValues } from '../components/curriculum/ClaseFormFields';
import { ClaseNode, type ClaseNodeType } from '../components/curriculum/ClaseNode';
import { RequisitoEdge, type RequisitoEdgeType, type RequisitoHighlight } from '../components/curriculum/RequisitoEdge';
import { RequisitoPicker, type RequisitoSeleccionado } from '../components/curriculum/RequisitoPicker';
import { TipoConexionDialog } from '../components/curriculum/TipoConexionDialog';
import { calcularAutoLayout, defaultPosition, posicionDeClase } from '../curriculum/layout';
import type { ClaseView, PlantillaArbol, TipoRequisito } from '../curriculum/types';

const nodeTypes = { clase: ClaseNode };
const edgeTypes = { requisito: RequisitoEdge };

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

const CLASE_VACIA: ClaseFormValues = {
  codigo: '',
  nombre: '',
  unidadesValorativas: '3',
  nivel: '1',
  tipo: 'OBLIGATORIA',
};

interface PendingConnection {
  source: string;
  target: string;
}

interface AristaPendiente {
  localId: string;
  source: string;
  target: string;
  tipo: TipoRequisito;
}

// React Flow solo acumula la selección de nodos al hacer clic cuando su
// tecla de "multi-selección" está presionada. Como queremos que el modo
// selección acumule con un simple clic (sin mantener ninguna tecla), este
// componente (hijo del canvas, puede usar el store interno) fuerza esa
// bandera mientras el modo esté activo.
function SincronizarSeleccionMultiple({ activo }: { activo: boolean }) {
  const store = useStoreApi();
  useEffect(() => {
    store.setState({ multiSelectionActive: activo });
  }, [activo, store]);
  return null;
}

// fitView solo centra la vista una vez, al montar. Sin esto, una clase
// movida muy lejos queda guardada correctamente pero fuera del área visible
// del canvas tras recargar, dando la impresión de que no se guardó nada.
function AjustarVistaAlGuardar({ tick }: { tick: number }) {
  const { fitView } = useReactFlow();
  const esPrimerRender = useRef(true);
  useEffect(() => {
    if (esPrimerRender.current) {
      esPrimerRender.current = false;
      return;
    }
    fitView({ duration: 300, padding: 0.2 });
  }, [tick, fitView]);
  return null;
}

function IconoPuntero() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16.006 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
    </svg>
  );
}

export function PlantillaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [arbol, setArbol] = useState<PlantillaArbol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Los cambios en el canvas (posiciones y conexiones/desconexiones) no se
  // persisten al instante: se acumulan aquí y solo se envían al backend
  // cuando el usuario presiona "Guardar cambios".
  const [posicionesPendientes, setPosicionesPendientes] = useState<Record<string, { x: number; y: number }>>({});
  const [aristasPendientesNuevas, setAristasPendientesNuevas] = useState<AristaPendiente[]>([]);
  const [relacionesPendientesEliminar, setRelacionesPendientesEliminar] = useState<Set<string>>(new Set());

  const [nodes, setNodes, onNodesChange] = useNodesState<ClaseNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RequisitoEdgeType>([]);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  const [nuevaClase, setNuevaClase] = useState<ClaseFormValues>(CLASE_VACIA);
  const [nuevosRequisitos, setNuevosRequisitos] = useState<RequisitoSeleccionado[]>([]);
  const [creando, setCreando] = useState(false);

  const [editingClaseId, setEditingClaseId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [saveTick, setSaveTick] = useState(0);

  const cargar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setArbol(await getPlantillaArbol(id));
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar la plantilla.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const todasLasClases: ClaseView[] = useMemo(
    () => arbol?.niveles.flatMap((n) => n.clases) ?? [],
    [arbol],
  );

  // Reconstruye los nodos del canvas cada vez que se recarga la plantilla,
  // superponiendo las posiciones aún no guardadas (posicionesPendientes) para
  // que no se pierdan si el árbol se recarga por otra acción (p. ej. editar
  // una clase) antes de presionar "Guardar cambios".
  useEffect(() => {
    if (!arbol) return;
    const indicePorNivel = new Map<number, number>();
    const nuevosNodos: ClaseNodeType[] = todasLasClases.map((clase) => {
      const idx = indicePorNivel.get(clase.nivel) ?? 0;
      indicePorNivel.set(clase.nivel, idx + 1);
      return {
        id: clase.id,
        type: 'clase',
        position: posicionesPendientes[clase.id] ?? posicionDeClase(clase, idx),
        data: { clase },
      };
    });
    setNodes(nuevosNodos);
  }, [arbol, todasLasClases, posicionesPendientes, setNodes]);

  // Las aristas se reconstruyen también cuando cambia el nodo resaltado
  // (hover), para colorear solo sus conexiones directas, y cuando cambian
  // las conexiones/desconexiones aún no guardadas.
  useEffect(() => {
    if (!arbol) return;
    const nuevasAristas: RequisitoEdgeType[] = [];

    function construirArista(
      relacionId: string,
      source: string,
      target: string,
      tipo: TipoRequisito,
      pendiente: boolean,
    ) {
      const highlight: RequisitoHighlight = !highlightedNodeId
        ? 'normal'
        : source === highlightedNodeId || target === highlightedNodeId
          ? 'accent'
          : 'dim';
      nuevasAristas.push({
        id: relacionId,
        type: 'requisito',
        source,
        target,
        markerEnd: { type: MarkerType.ArrowClosed, color: tipo === 'CORREQUISITO' ? '#8a90a0' : '#5b73f5' },
        data: {
          tipo,
          highlight,
          pendiente,
          onDelete: () => handleEliminarRequisito(relacionId, pendiente),
        },
      });
    }

    for (const clase of todasLasClases) {
      for (const r of clase.prerrequisitos) {
        if (relacionesPendientesEliminar.has(r.relacionId)) continue;
        construirArista(r.relacionId, r.claseId, clase.id, 'PRERREQUISITO', false);
      }
      for (const r of clase.correquisitos) {
        if (relacionesPendientesEliminar.has(r.relacionId)) continue;
        construirArista(r.relacionId, r.claseId, clase.id, 'CORREQUISITO', false);
      }
    }
    for (const pendiente of aristasPendientesNuevas) {
      construirArista(pendiente.localId, pendiente.source, pendiente.target, pendiente.tipo, true);
    }
    setEdges(nuevasAristas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arbol, todasLasClases, highlightedNodeId, aristasPendientesNuevas, relacionesPendientesEliminar, setEdges]);

  function handleEliminarRequisito(relacionId: string, pendiente: boolean) {
    if (pendiente) {
      setAristasPendientesNuevas((prev) => prev.filter((a) => a.localId !== relacionId));
      return;
    }
    setRelacionesPendientesEliminar((prev) => new Set(prev).add(relacionId));
  }

  function onNodeDragStop(_: unknown, node: ClaseNodeType, nodesArrastrados: ClaseNodeType[]) {
    // Con varios nodos seleccionados, React Flow los mueve todos juntos pero
    // `node` es solo el que se agarró con el mouse; `nodesArrastrados` trae
    // la posición final de TODOS los que se movieron.
    const movidos = nodesArrastrados.length > 0 ? nodesArrastrados : [node];
    setPosicionesPendientes((prev) => {
      const next = { ...prev };
      for (const n of movidos) {
        next[n.id] = { x: n.position.x, y: n.position.y };
      }
      return next;
    });
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) {
      setError('Una clase no puede ser prerrequisito o correquisito de sí misma.');
      return;
    }
    setPendingConnection({ source: connection.source, target: connection.target });
  }

  function confirmarConexion(tipo: TipoRequisito) {
    if (!pendingConnection) return;
    setAristasPendientesNuevas((prev) => [
      ...prev,
      {
        localId: `pendiente-${crypto.randomUUID()}`,
        source: pendingConnection.source,
        target: pendingConnection.target,
        tipo,
      },
    ]);
    setPendingConnection(null);
  }

  async function onAgregarClase(e: FormEvent) {
    e.preventDefault();
    if (!id || !nuevaClase.codigo.trim() || !nuevaClase.nombre.trim()) return;
    setCreando(true);
    setError(null);
    try {
      const nivelNum = Number(nuevaClase.nivel);
      const indexEnNivel = arbol?.niveles.find((n) => n.nivel === nivelNum)?.clases.length ?? 0;
      const pos = defaultPosition(nivelNum, indexEnNivel);

      const clase = await addClase(id, {
        codigo: nuevaClase.codigo.trim(),
        nombre: nuevaClase.nombre.trim(),
        unidadesValorativas: Number(nuevaClase.unidadesValorativas),
        nivel: nivelNum,
        tipo: nuevaClase.tipo,
        posX: pos.x,
        posY: pos.y,
      });

      for (const r of nuevosRequisitos) {
        await addRequisito(clase.id, r.claseId, r.tipo);
      }

      setNuevaClase({ ...CLASE_VACIA, nivel: nuevaClase.nivel });
      setNuevosRequisitos([]);
      await cargar();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo agregar la clase.'));
    } finally {
      setCreando(false);
    }
  }

  async function handleGuardarEdicion(
    claseId: string,
    values: ClaseFormValues,
    requisitosNuevos: RequisitoSeleccionado[],
  ) {
    await updateClase(claseId, {
      codigo: values.codigo.trim(),
      nombre: values.nombre.trim(),
      unidadesValorativas: Number(values.unidadesValorativas),
      nivel: Number(values.nivel),
      tipo: values.tipo,
    });

    const clase = todasLasClases.find((c) => c.id === claseId);
    const actuales = new Map<string, { relacionId: string; tipo: TipoRequisito }>();
    if (clase) {
      for (const r of clase.prerrequisitos) {
        actuales.set(r.claseId, { relacionId: r.relacionId, tipo: 'PRERREQUISITO' });
      }
      for (const r of clase.correquisitos) {
        actuales.set(r.claseId, { relacionId: r.relacionId, tipo: 'CORREQUISITO' });
      }
    }
    const nuevos = new Map(requisitosNuevos.map((r) => [r.claseId, r.tipo]));

    for (const [claseReqId, actual] of actuales) {
      const nuevoTipo = nuevos.get(claseReqId);
      if (!nuevoTipo || nuevoTipo !== actual.tipo) {
        await deleteRequisito(actual.relacionId);
      }
    }
    for (const [claseReqId, tipo] of nuevos) {
      const actual = actuales.get(claseReqId);
      if (!actual || actual.tipo !== tipo) {
        await addRequisito(claseId, claseReqId, tipo);
      }
    }

    setEditingClaseId(null);
    await cargar();
  }

  async function handleEliminarClase(claseId: string) {
    await deleteClase(claseId);
    setEditingClaseId(null);
    await cargar();
  }

  function onAutoOrdenar() {
    if (!arbol) return;
    const posiciones = calcularAutoLayout(arbol);
    setPosicionesPendientes((prev) => {
      const next = { ...prev };
      for (const [claseId, pos] of posiciones) {
        next[claseId] = pos;
      }
      return next;
    });
  }

  const hayCambiosPendientes =
    Object.keys(posicionesPendientes).length > 0 ||
    aristasPendientesNuevas.length > 0 ||
    relacionesPendientesEliminar.size > 0;

  async function onGuardarCambios() {
    setGuardando(true);
    setError(null);
    try {
      await Promise.all(
        Object.entries(posicionesPendientes).map(([claseId, pos]) =>
          updateClase(claseId, { posX: pos.x, posY: pos.y }),
        ),
      );
      for (const arista of aristasPendientesNuevas) {
        await addRequisito(arista.target, arista.source, arista.tipo);
      }
      await Promise.all([...relacionesPendientesEliminar].map((relacionId) => deleteRequisito(relacionId)));

      setPosicionesPendientes({});
      setAristasPendientesNuevas([]);
      setRelacionesPendientesEliminar(new Set());
      await cargar();
      setSaveTick((t) => t + 1);
    } catch (err) {
      setError(errorMessage(err, 'No se pudieron guardar los cambios.'));
    } finally {
      setGuardando(false);
    }
  }

  const titulo = arbol
    ? `${arbol.nombre} · v${arbol.version}${arbol.activa ? '' : ' (inactiva)'}`
    : 'Editor de plantilla';

  if (loading && !arbol) {
    return (
      <AppShell title={titulo} backTo="/admin/plantillas" backLabel="Plantillas">
        <p>Cargando…</p>
      </AppShell>
    );
  }

  if (!arbol) {
    return (
      <AppShell title={titulo} backTo="/admin/plantillas" backLabel="Plantillas">
        <p className="page-error">{error ?? 'Plantilla no encontrada.'}</p>
      </AppShell>
    );
  }

  const editingClase = todasLasClases.find((c) => c.id === editingClaseId) ?? null;
  const requisitoCodigo = pendingConnection
    ? (todasLasClases.find((c) => c.id === pendingConnection.source)?.codigo ?? '?')
    : '';
  const claseCodigo = pendingConnection
    ? (todasLasClases.find((c) => c.id === pendingConnection.target)?.codigo ?? '?')
    : '';

  return (
    <AppShell title={titulo} backTo="/admin/plantillas" backLabel="Plantillas">
      {error && <p className="page-error">{error}</p>}

      <section className="panel">
        <h2>Agregar clase</h2>
        <form onSubmit={onAgregarClase}>
          <ClaseFormFields values={nuevaClase} onChange={setNuevaClase} />
          <label className="field" style={{ marginTop: 12 }}>
            Requisitos (prerrequisitos o correquisitos)
            <RequisitoPicker clases={todasLasClases} value={nuevosRequisitos} onChange={setNuevosRequisitos} />
          </label>
          <button type="submit" className={`btn btn-primary ${creando ? 'btn-loading' : ''}`} disabled={creando} style={{ marginTop: 12 }}>
            Agregar
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Malla curricular</h2>
          <div className="panel-header-actions">
            {hayCambiosPendientes && <span className="unsaved-hint">Cambios sin guardar</span>}
            <button className="btn btn-secondary btn-sm" onClick={onAutoOrdenar}>
              Auto-ordenar por nivel
            </button>
            <button
              className={`btn btn-primary btn-sm ${guardando ? 'btn-loading' : ''}`}
              disabled={!hayCambiosPendientes || guardando}
              onClick={onGuardarCambios}
            >
              Guardar cambios
            </button>
          </div>
        </div>
        <p className="flow-legend">
          Arrastra los nodos para reacomodarlos, o conecta desde el borde derecho de una clase hasta el borde
          izquierdo de otra para crear una relación. Línea sólida = prerrequisito · línea punteada = correquisito.
          Pasa el cursor sobre un nodo para resaltar sus conexiones; haz clic para editarlo. Los cambios de
          posición y de conexiones no se guardan hasta presionar "Guardar cambios". Usa el botón de puntero de
          los controles para activar el modo selección (clic para elegir clases una a una, o arrastra un cuadro
          para seleccionar varias; el paneo del canvas queda disponible con el botón central o derecho del mouse).
        </p>

        {todasLasClases.length === 0 ? (
          <p>Esta plantilla todavía no tiene clases. Agrega la primera con el formulario de arriba.</p>
        ) : (
          <div className="flow-canvas-wrapper">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_, node) => {
                if (modoSeleccion) return;
                setEditingClaseId(node.id);
              }}
              onNodeMouseEnter={(_, node) => setHighlightedNodeId(node.id)}
              onNodeMouseLeave={() => setHighlightedNodeId(null)}
              onConnect={onConnect}
              colorMode="system"
              fitView
              proOptions={{ hideAttribution: true }}
              selectionOnDrag={modoSeleccion}
              selectionMode={SelectionMode.Partial}
              panOnDrag={modoSeleccion ? [1, 2] : true}
            >
              <SincronizarSeleccionMultiple activo={modoSeleccion} />
              <AjustarVistaAlGuardar tick={saveTick} />
              <Background gap={20} />
              <Controls showInteractive={false}>
                <ControlButton
                  className={modoSeleccion ? 'flow-controls-button-activo' : ''}
                  onClick={() => setModoSeleccion((activo) => !activo)}
                  title={modoSeleccion ? 'Desactivar modo selección' : 'Activar modo selección'}
                >
                  <IconoPuntero />
                </ControlButton>
              </Controls>
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        )}
      </section>

      {editingClase && (
        <ClaseEditModal
          clase={editingClase}
          todasLasClases={todasLasClases}
          onClose={() => setEditingClaseId(null)}
          onSave={(values, requisitos) => handleGuardarEdicion(editingClase.id, values, requisitos)}
          onDelete={() => handleEliminarClase(editingClase.id)}
        />
      )}

      {pendingConnection && (
        <TipoConexionDialog
          requisitoCodigo={requisitoCodigo}
          claseCodigo={claseCodigo}
          onElegir={confirmarConexion}
          onCancelar={() => setPendingConnection(null)}
          procesando={false}
          error={null}
        />
      )}
    </AppShell>
  );
}
