import { useState } from 'react';
import type { ClaseView, TipoRequisito } from '../../curriculum/types';

export interface RequisitoSeleccionado {
  claseId: string;
  tipo: TipoRequisito;
}

interface RequisitoPickerProps {
  clases: ClaseView[];
  excludeId?: string;
  value: RequisitoSeleccionado[];
  onChange: (next: RequisitoSeleccionado[]) => void;
}

export function RequisitoPicker({ clases, excludeId, value, onChange }: RequisitoPickerProps) {
  const [query, setQuery] = useState('');

  const seleccionadosIds = new Set(value.map((v) => v.claseId));
  const q = query.trim().toLowerCase();
  const sugerencias =
    q.length === 0
      ? []
      : clases
          .filter(
            (c) =>
              c.id !== excludeId &&
              !seleccionadosIds.has(c.id) &&
              (c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)),
          )
          .slice(0, 8);

  function agregar(claseId: string) {
    onChange([...value, { claseId, tipo: 'PRERREQUISITO' }]);
    setQuery('');
  }

  function quitar(claseId: string) {
    onChange(value.filter((v) => v.claseId !== claseId));
  }

  function cambiarTipo(claseId: string, tipo: TipoRequisito) {
    onChange(value.map((v) => (v.claseId === claseId ? { ...v, tipo } : v)));
  }

  return (
    <div className="requisito-picker">
      <div className="requisito-picker-input-wrap">
        <input
          placeholder="Buscar clase por código o nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {sugerencias.length > 0 && (
          <ul className="requisito-picker-suggestions">
            {sugerencias.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => agregar(c.id)}>
                  <strong>{c.codigo}</strong> — {c.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {value.length > 0 && (
        <div className="requisito-picker-chips">
          {value.map((v) => {
            const clase = clases.find((c) => c.id === v.claseId);
            return (
              <span key={v.claseId} className="chip requisito-picker-chip">
                {clase?.codigo ?? '?'}
                <select value={v.tipo} onChange={(e) => cambiarTipo(v.claseId, e.target.value as TipoRequisito)}>
                  <option value="PRERREQUISITO">Prerreq.</option>
                  <option value="CORREQUISITO">Correq.</option>
                </select>
                <button type="button" onClick={() => quitar(v.claseId)}>
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
