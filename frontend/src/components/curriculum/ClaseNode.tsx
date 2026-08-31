import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ClaseView } from '../../curriculum/types';

export type ClaseNodeType = Node<{ clase: ClaseView }, 'clase'>;

export function ClaseNode({ data, selected }: NodeProps<ClaseNodeType>) {
  const { clase } = data;
  const esElectiva = clase.tipo === 'ELECTIVA';

  return (
    <div className={`flow-node ${esElectiva ? 'flow-node-electiva' : 'flow-node-obligatoria'} ${selected ? 'flow-node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />

      <div className="flow-node-header">
        <strong>{clase.codigo}</strong>
        <span className={`badge ${esElectiva ? 'badge-warning' : 'badge-accent'}`}>
          {esElectiva ? 'Electiva' : 'Obligatoria'}
        </span>
      </div>
      <div className="flow-node-nombre">{clase.nombre}</div>
      <div className="flow-node-meta">
        {clase.unidadesValorativas} U.V. · Nivel {clase.nivel}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
