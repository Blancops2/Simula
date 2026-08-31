import { Background, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { desmarcarClaseCursada, getPensum, marcarClaseCursada } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import { PensumClaseNode, type PensumClaseNodeType } from '../components/curriculum/PensumClaseNode';
import { RequisitoEdge, type RequisitoEdgeType } from '../components/curriculum/RequisitoEdge';
import { posicionDeClase } from '../curriculum/layout';
import type { ClasePensum, PensumArbol } from '../estudiante/types';

const nodeTypes = { clase: PensumClaseNode };
const edgeTypes = { requisito: RequisitoEdge };

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function PensumPage() {
  const [arbol, setArbol] = useState<PensumArbol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<PensumClaseNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RequisitoEdgeType>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setArbol(await getPensum());
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar tu pensum.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const todasLasClases: ClasePensum[] = useMemo(() => arbol?.niveles.flatMap((n) => n.clases) ?? [], [arbol]);

  const onToggle = useCallback(async (claseId: string, marcar: boolean) => {
    setProcesandoId(claseId);
    setError(null);
    try {
      if (marcar) {
        await marcarClaseCursada(claseId);
      } else {
        await desmarcarClaseCursada(claseId);
      }
      setArbol((prev) =>
        prev
          ? {
              ...prev,
              niveles: prev.niveles.map((n) => ({
                ...n,
                clases: n.clases.map((c) =>
                  c.id === claseId ? { ...c, cursada: marcar, autorreportada: marcar } : c,
                ),
              })),
            }
          : prev,
      );
    } catch (err) {
      setError(errorMessage(err, 'No se pudo actualizar la clase.'));
    } finally {
      setProcesandoId(null);
    }
  }, []);

  // Reconstruye los nodos cada vez que cambia el árbol o el estado de
  // "procesando" (para deshabilitar el checkbox de la clase en vuelo). Los
  // nodos no son arrastrables: esta vista es de solo lectura salvo el
  // checkbox de autorreporte.
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
        data: { clase, procesando: procesandoId === clase.id, onToggle },
      };
    });
    setNodes(nuevosNodos);
  }, [arbol, todasLasClases, procesandoId, onToggle, setNodes]);

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
          markerEnd: { type: MarkerType.ArrowClosed, color: '#5b73f5' },
          data: { tipo: 'PRERREQUISITO', highlight: 'normal', onDelete: () => {} },
        });
      }
      for (const r of clase.correquisitos) {
        nuevasAristas.push({
          id: r.relacionId,
          type: 'requisito',
          source: r.claseId,
          target: clase.id,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8a90a0' },
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
        Este es tu plan de estudio completo, igual al que arma el administrador. Marca “Ya la cursé” en las
        clases que ya completaste: se pintarán de verde, contarán en tu avance académico y habilitarán las
        clases que las tengan como prerrequisito, igual que si quedaran aprobadas en tu historial. Las clases
        que ya tienes registradas oficialmente por el administrador aparecen marcadas y no se pueden desmarcar
        desde aquí.
      </p>

      {todasLasClases.length === 0 ? (
        <p>Tu plantilla de malla todavía no tiene clases cargadas.</p>
      ) : (
        <div className="flow-canvas-wrapper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
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
    </AppShell>
  );
}
