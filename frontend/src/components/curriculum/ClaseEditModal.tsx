import { useState } from 'react';
import type { ClaseView } from '../../curriculum/types';
import { ClaseFormFields, type ClaseFormValues } from './ClaseFormFields';
import { RequisitoPicker, type RequisitoSeleccionado } from './RequisitoPicker';

interface ClaseEditModalProps {
  clase: ClaseView;
  todasLasClases: ClaseView[];
  onClose: () => void;
  onSave: (values: ClaseFormValues, requisitos: RequisitoSeleccionado[]) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function ClaseEditModal({ clase, todasLasClases, onClose, onSave, onDelete }: ClaseEditModalProps) {
  const [values, setValues] = useState<ClaseFormValues>({
    codigo: clase.codigo,
    nombre: clase.nombre,
    unidadesValorativas: String(clase.unidadesValorativas),
    nivel: String(clase.nivel),
    tipo: clase.tipo,
  });
  const [requisitos, setRequisitos] = useState<RequisitoSeleccionado[]>([
    ...clase.prerrequisitos.map((r) => ({ claseId: r.claseId, tipo: 'PRERREQUISITO' as const })),
    ...clase.correquisitos.map((r) => ({ claseId: r.claseId, tipo: 'CORREQUISITO' as const })),
  ]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dependientes = todasLasClases.filter(
    (c) =>
      c.id !== clase.id &&
      (c.prerrequisitos.some((p) => p.claseId === clase.id) || c.correquisitos.some((p) => p.claseId === clase.id)),
  );

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await onSave(values, requisitos);
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'No se pudo guardar la clase.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar() {
    let mensaje = `¿Eliminar la clase "${clase.codigo} — ${clase.nombre}"?`;
    if (dependientes.length > 0) {
      mensaje += `\n\nAdvertencia: las siguientes clases la tienen como requisito y perderán esa relación:\n${dependientes
        .map((c) => `• ${c.codigo} — ${c.nombre}`)
        .join('\n')}`;
    }
    if (!window.confirm(mensaje)) return;

    setGuardando(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'No se pudo eliminar la clase.');
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Editar clase</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error && <p className="page-error">{error}</p>}
        {dependientes.length > 0 && (
          <p className="page-warning">
            Esta clase es requisito de: {dependientes.map((c) => c.codigo).join(', ')}
          </p>
        )}

        <ClaseFormFields values={values} onChange={setValues} />

        <label className="field" style={{ marginTop: 16 }}>
          Requisitos
          <RequisitoPicker clases={todasLasClases} excludeId={clase.id} value={requisitos} onChange={setRequisitos} />
        </label>

        <div className="modal-footer">
          <button className="btn btn-danger" disabled={guardando} onClick={handleEliminar}>
            Eliminar clase
          </button>
          <div className="inline-form">
            <button className="btn btn-secondary" disabled={guardando} onClick={onClose}>
              Cancelar
            </button>
            <button className={`btn btn-primary ${guardando ? 'btn-loading' : ''}`} disabled={guardando} onClick={handleGuardar}>
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
