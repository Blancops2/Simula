import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ClasePensum } from '../../estudiante/types';

export type PensumClaseNodeType = Node<
  {
    clase: ClasePensum;
    procesando: boolean;
    // Calculado en PensumPage a partir del `cursada` de las demás clases del
    // árbol (mismo criterio que usa el backend en construirMallaConEstado /
    // inscribir): esta clase no se puede marcar "en curso" mientras algún
    // prerrequisito no esté aprobado.
    prerrequisitosCumplidos: boolean;
    onToggle: (claseId: string, marcar: boolean) => void;
  },
  'clase'
>;

export function PensumClaseNode({ data }: NodeProps<PensumClaseNodeType>) {
  const { clase, procesando, prerrequisitosCumplidos, onToggle } = data;
  const esElectiva = clase.tipo === 'ELECTIVA';
  // El checkbox solo autorreporta "en curso" (gris); aprobada/reprobada ya
  // no se edita desde el Pensum (se sube por CSV o la carga el
  // administrador), así que no tiene sentido ofrecerlo una vez aprobada. Si
  // le faltan prerrequisitos, la opción directamente no aparece (no se
  // muestra deshabilitada con mensaje) — igual que una clase ya aprobada.
  const puedeMarcarEnCurso = !clase.cursada && (clase.enCurso || prerrequisitosCumplidos);
  const bloqueadoPorAdmin = clase.enCurso && clase.oficial;
  const etiquetaCheckbox = bloqueadoPorAdmin ? 'En curso (registrado por el administrador)' : 'Marcar como en curso';

  return (
    <div
      className={`flow-node ${esElectiva ? 'flow-node-electiva' : 'flow-node-obligatoria'} ${
        clase.cursada ? 'flow-node-cursada' : clase.enCurso ? 'flow-node-en-curso' : ''
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

      {puedeMarcarEnCurso && (
        <label className="tree-node-checkbox nodrag nopan" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="nodrag"
            checked={clase.enCurso}
            disabled={bloqueadoPorAdmin || procesando}
            onChange={(e) => onToggle(clase.id, e.target.checked)}
          />
          {etiquetaCheckbox}
        </label>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
