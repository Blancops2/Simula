import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { TipoRequisito } from '../../curriculum/types';

export type RequisitoHighlight = 'normal' | 'accent' | 'dim';

export type RequisitoEdgeType = Edge<
  { tipo: TipoRequisito; highlight: RequisitoHighlight; pendiente?: boolean; onDelete: () => void },
  'requisito'
>;

export function RequisitoEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<RequisitoEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const highlight = data?.highlight ?? 'normal';
  const esCorrequisito = data?.tipo === 'CORREQUISITO';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={[
          'flow-edge',
          esCorrequisito ? 'flow-edge-correquisito' : 'flow-edge-prerrequisito',
          `flow-edge-${highlight}`,
          selected ? 'flow-edge-selected' : '',
          data?.pendiente ? 'flow-edge-pendiente' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            className="flow-edge-delete"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onClick={(event) => {
              event.stopPropagation();
              data?.onDelete();
            }}
            title="Eliminar relación"
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
