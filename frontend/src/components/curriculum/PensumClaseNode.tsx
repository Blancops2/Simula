import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ClasePensum } from '../../estudiante/types';

export type PensumClaseNodeType = Node<
  { clase: ClasePensum; procesando: boolean; onToggle: (claseId: string, marcar: boolean) => void },
  'clase'
>;

export function PensumClaseNode({ data }: NodeProps<PensumClaseNodeType>) {
  const { clase, procesando, onToggle } = data;
  const esElectiva = clase.tipo === 'ELECTIVA';

  return (
    <div
      className={`flow-node ${esElectiva ? 'flow-node-electiva' : 'flow-node-obligatoria'} ${
        clase.cursada ? 'flow-node-cursada' : ''
      }`}
    >
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

      <label className="tree-node-checkbox nodrag nopan">
        <input
          type="checkbox"
          className="nodrag"
          checked={clase.cursada}
          disabled={clase.oficial || procesando}
          onChange={(e) => onToggle(clase.id, e.target.checked)}
        />
        {clase.oficial ? 'Cursada (en tu historial)' : 'Ya la cursé'}
      </label>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
