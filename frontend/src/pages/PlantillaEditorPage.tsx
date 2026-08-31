import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
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

export function PlantillaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [arbol, setArbol] = useState<PlantillaArbol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoOrdenando, setAutoOrdenando] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<ClaseNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RequisitoEdgeType>([]);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  const [nuevaClase, setNuevaClase] = useState<ClaseFormValues>(CLASE_VACIA);
  const [nuevosRequisitos, setNuevosRequisitos] = useState<RequisitoSeleccionado[]>([]);
  const [creando, setCreando] = useState(false);

  const [editingClaseId, setEditingClaseId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [conexionError, setConexionError] = useState<string | null>(null);
  const [conexionProcesando, setConexionProcesando] = useState(false);

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

  // Reconstruye los nodos del canvas cada vez que se recarga la plantilla.
  // El arrastre de nodos actualiza la posición localmente (useNodesState) y
  // se persiste en onNodeDragStop, sin forzar una recarga completa.
  useEffect(() => {
    if (!arbol) return;
    const indicePorNivel = new Map<number, number>();
    const nuevosNodos: ClaseNodeType[] = todasLasClases.map((clase) => {
      const idx = indicePorNivel.get(clase.nivel) ?? 0;
      indicePorNivel.set(clase.nivel, idx + 1);
      return {
        id: clase.id,
        type: 'clase',
        position: posicionDeClase(clase, idx),
        data: { clase },
      };
    });
    setNodes(nuevosNodos);
  }, [arbol, todasLasClases, setNodes]);

  // Las aristas se reconstruyen también cuando cambia el nodo resaltado
  // (hover), para colorear solo sus conexiones directas.
  useEffect(() => {
    if (!arbol) return;
    const nuevasAristas: RequisitoEdgeType[] = [];

    function construirArista(relacionId: string, source: string, target: string, tipo: TipoRequisito) {
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
          onDelete: () => handleEliminarRequisito(relacionId),
        },
      });
    }

    for (const clase of todasLasClases) {
      for (const r of clase.prerrequisitos) {
        construirArista(r.relacionId, r.claseId, clase.id, 'PRERREQUISITO');
      }
      for (const r of clase.correquisitos) {
        construirArista(r.relacionId, r.claseId, clase.id, 'CORREQUISITO');
      }
    }
    setEdges(nuevasAristas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arbol, todasLasClases, highlightedNodeId, setEdges]);

  async function handleEliminarRequisito(relacionId: string) {
    setError(null);
    try {
      await deleteRequisito(relacionId);
      await cargar();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar la relación.'));
    }
  }

  async function onNodeDragStop(_: unknown, node: ClaseNodeType) {
    try {
      await updateClase(node.id, { posX: node.position.x, posY: node.position.y });
    } catch {
      setError('No se pudo guardar la nueva posición del nodo.');
    }
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) {
      setError('Una clase no puede ser prerrequisito o correquisito de sí misma.');
      return;
    }
    setConexionError(null);
    setPendingConnection({ source: connection.source, target: connection.target });
  }

  async function confirmarConexion(tipo: TipoRequisito) {
    if (!pendingConnection) return;
    setConexionProcesando(true);
    setConexionError(null);
    try {
      await addRequisito(pendingConnection.target, pendingConnection.source, tipo);
      setPendingConnection(null);
      await cargar();
    } catch (err) {
      setConexionError(errorMessage(err, 'No se pudo crear la relación.'));
    } finally {
      setConexionProcesando(false);
    }
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

  async function onAutoOrdenar() {
    if (!arbol) return;
    setAutoOrdenando(true);
    setError(null);
    try {
      const posiciones = calcularAutoLayout(arbol);
      await Promise.all(
        [...posiciones.entries()].map(([claseId, pos]) => updateClase(claseId, { posX: pos.x, posY: pos.y })),
      );
      await cargar();
    } catch {
      setError('No se pudo reordenar automáticamente.');
    } finally {
      setAutoOrdenando(false);
    }
  }

  const titulo = arbol
    ? `${arbol.nombre} · v${arbol.version}${arbol.activa ? '' : ' (inactiva)'}`
    : 'Editor de plantilla';

  if (loading) {
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
          <button className={`btn btn-secondary btn-sm ${autoOrdenando ? 'btn-loading' : ''}`} disabled={autoOrdenando} onClick={onAutoOrdenar}>
            Auto-ordenar por nivel
          </button>
        </div>
        <p className="flow-legend">
          Arrastra los nodos para reacomodarlos, o conecta desde el borde derecho de una clase hasta el borde
          izquierdo de otra para crear una relación. Línea sólida = prerrequisito · línea punteada = correquisito.
          Pasa el cursor sobre un nodo para resaltar sus conexiones; haz clic para editarlo.
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
              onNodeClick={(_, node) => setEditingClaseId(node.id)}
              onNodeMouseEnter={(_, node) => setHighlightedNodeId(node.id)}
              onNodeMouseLeave={() => setHighlightedNodeId(null)}
              onConnect={onConnect}
              colorMode="system"
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} />
              <Controls showInteractive={false} />
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
          procesando={conexionProcesando}
          error={conexionError}
        />
      )}
    </AppShell>
  );
}
