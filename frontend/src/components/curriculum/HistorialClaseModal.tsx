import { formatPeriodo } from '../../estudiante/periodo';
import type { ClasePensum, HistorialItem } from '../../estudiante/types';

interface HistorialClaseModalProps {
  clase: ClasePensum;
  historial: HistorialItem[];
  onClose: () => void;
}

const ETIQUETAS_ESTADO: Record<HistorialItem['estado'], string> = {
  APROBADA: 'Aprobada',
  REPROBADA: 'Reprobada',
  EN_CURSO: 'En curso',
};

// Solo lectura: el historial de una clase (una fila por vez que se cursó) ya
// no se edita desde el Pensum, se sube por CSV o lo carga el administrador
// (ver docs/subir-historial.md). Este modal solo muestra lo que ya existe.
export function HistorialClaseModal({ clase, historial, onClose }: HistorialClaseModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {clase.codigo} — {clase.nombre}
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {historial.length === 0 ? (
          <p className="tree-node-meta">Todavía no tienes historial registrado para esta clase.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Estado</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{formatPeriodo(h.periodo, h.anno)}</td>
                    <td>
                      <span className={`badge status-${h.estado.toLowerCase()}`}>{ETIQUETAS_ESTADO[h.estado]}</span>
                    </td>
                    <td>{h.nota ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
