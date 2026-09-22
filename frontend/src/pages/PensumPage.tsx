import { Background, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { desmarcarClaseEnCurso, getHistorial, getPensum, marcarClaseEnCurso } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import { HistorialClaseModal } from '../components/curriculum/HistorialClaseModal';
import { PensumClaseNode, type PensumClaseNodeType } from '../components/curriculum/PensumClaseNode';
import { RequisitoEdge, type RequisitoEdgeType } from '../components/curriculum/RequisitoEdge';
import { posicionDeClase } from '../curriculum/layout';
import type { ClasePensum, HistorialItem, PensumArbol } from '../estudiante/types';

const nodeTypes = { clase: PensumClaseNode };
const edgeTypes = { requisito: RequisitoEdge };

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function PensumPage() {
  const [arbol, setArbol] = useState<PensumArbol | null>(null);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [verHistorialClaseId, setVerHistorialClaseId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<PensumClaseNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RequisitoEdgeType>([]);

  // No pone `loading` en true aquí: ese estado solo controla la pantalla
  // "Cargando…" del primer render (ver el efecto de montaje, abajo). Si lo
  // hiciera también en cada refresco tras marcar/desmarcar "en curso",
  // `loading` volvería a true, se desmontaría el lienzo de React Flow por
  // completo y el estudiante perdería el pan/zoom donde estaba — el efecto
  // de "se refresca y me mueve" que se quería evitar.
  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [arbolData, historialData] = await Promise.all([getPensum(), getHistorial()]);
      setArbol(arbolData);
      setHistorial(historialData);
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar tu pensum.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    cargar();
  }, [cargar]);

  const todasLasClases: ClasePensum[] = useMemo(() => arbol?.niveles.flatMap((n) => n.clases) ?? [], [arbol]);
  const claseSeleccionada = useMemo(
    () => todasLasClases.find((c) => c.id === verHistorialClaseId) ?? null,
    [todasLasClases, verHistorialClaseId],
  );
  const historialClaseSeleccionada = useMemo(
    () => (claseSeleccionada ? historial.filter((h) => h.clase.codigo === claseSeleccionada.codigo) : []),
    [historial, claseSeleccionada],
  );

  // Mismo criterio que el backend (construirMallaConEstado/inscribir): una
  // clase solo se puede marcar "en curso" si todos sus prerrequisitos ya
  // están aprobados. Se calcula aquí (no solo en el backend) para que el
  // checkbox ya aparezca deshabilitado antes de intentarlo.
  const cursadaPorId = useMemo(() => new Map(todasLasClases.map((c) => [c.id, c.cursada])), [todasLasClases]);

  // Único autorreporte que sigue existiendo desde el Pensum: "estoy cursando
  // esto ahora" (gris). Aprobada/reprobada, con su nota, ya no se edita
  // desde aquí — se sube por CSV o la carga el administrador.
  const onToggle = useCallback(
    async (claseId: string, marcar: boolean) => {
      setProcesandoId(claseId);
      setError(null);
      try {
        if (marcar) {
          await marcarClaseEnCurso(claseId);
        } else {
          await desmarcarClaseEnCurso(claseId);
        }
        await cargar();
      } catch (err) {
        setError(errorMessage(err, 'No se pudo actualizar la clase.'));
      } finally {
        setProcesandoId(null);
      }
    },
    [cargar],
  );

  // Reconstruye los nodos cada vez que cambia el árbol o el estado de
  // "procesando" (para deshabilitar el checkbox de la clase en vuelo). Los
  // nodos no son arrastrables: esta vista es de solo lectura salvo el
  // checkbox de "en curso".
  useEffect(() => {
    if (!arbol) return;
    const indicePorNivel = new Map<number, number>();
    const nuevosNodos: PensumClaseNodeType[] = todasLasClases.map((clase) => {
      const idx = indicePorNivel.get(clase.nivel) ?? 0;
      indicePorNivel.set(clase.nivel, idx + 1);
      return {
        id: clase.id,
        type: 'clase',
        position: posicionDeClase(clase, idx),
        // No arrastrable (vista de solo lectura), pero SÍ debe quedar
        // "selectable": React Flow le pone `pointer-events: none` inline al
        // nodo cuando no es seleccionable ni arrastrable y no tiene handlers
        // de click/hover, lo que también bloquea el checkbox de adentro.
        draggable: false,
        data: {
          clase,
          procesando: procesandoId === clase.id,
          prerrequisitosCumplidos: clase.prerrequisitos.every((r) => cursadaPorId.get(r.claseId) === true),
          onToggle,
        },
      };
    });
    setNodes(nuevosNodos);
  }, [arbol, todasLasClases, procesandoId, cursadaPorId, onToggle, setNodes]);

  useEffect(() => {
    if (!arbol) return;
    const nuevasAristas: RequisitoEdgeType[] = [];
    for (const clase of todasLasClases) {
      for (const r of clase.prerrequisitos) {
        nuevasAristas.push({
          id: r.relacionId,
          type: 'requisito',
          source: r.claseId,
          target: clase.id,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#fbb515' },
          data: { tipo: 'PRERREQUISITO', highlight: 'normal', onDelete: () => {} },
        });
      }
      for (const r of clase.correquisitos) {
        nuevasAristas.push({
          id: r.relacionId,
          type: 'requisito',
          source: r.claseId,
          target: clase.id,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#fbb515' },
          data: { tipo: 'CORREQUISITO', highlight: 'normal', onDelete: () => {} },
        });
      }
    }
    setEdges(nuevasAristas);
  }, [arbol, todasLasClases, setEdges]);

  const titulo = arbol ? `Pensum · ${arbol.plantilla.nombre} v${arbol.plantilla.version}` : 'Pensum';

  if (loading) {
    return (
      <AppShell title={titulo} backTo="/estudiante" backLabel="Mi perfil">
        <p>Cargando…</p>
      </AppShell>
    );
  }

  if (!arbol) {
    return (
      <AppShell title="Pensum" backTo="/estudiante" backLabel="Mi perfil">
        <p className="page-error">{error ?? 'No se pudo cargar tu pensum.'}</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={titulo} backTo="/estudiante" backLabel="Mi perfil">
      {error && <p className="page-error">{error}</p>}
      <p className="flow-legend">
        Este es tu plan de estudio completo, igual al que arma el administrador. Las clases en verde ya están
        aprobadas en tu historial (subido por CSV o cargado por el administrador); las clases en gris las marcaste
        como "en curso". Haz clic en cualquier clase para ver su historial completo — no se puede editar desde
        aquí.
      </p>

      {todasLasClases.length === 0 ? (
        <p>Tu plantilla de malla todavía no tiene clases cargadas.</p>
      ) : (
        <div className="flow-canvas-wrapper pensum-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setVerHistorialClaseId(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            colorMode="light"
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} color="rgba(255, 255, 255, 0.28)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      )}

      {claseSeleccionada && (
        <HistorialClaseModal
          key={claseSeleccionada.id}
          clase={claseSeleccionada}
          historial={historialClaseSeleccionada}
          onClose={() => setVerHistorialClaseId(null)}
        />
      )}
    </AppShell>
  );
}
