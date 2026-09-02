import { useState } from 'react';
import type { DetalleClaseCursada } from '../../api/estudianteApi';
import { parsePeriodoAnno } from '../../estudiante/periodo';
import type { ClasePensum } from '../../estudiante/types';

interface HistorialClaseModalProps {
  clase: ClasePensum;
  onClose: () => void;
  onSave: (detalle: Required<Pick<DetalleClaseCursada, 'periodo' | 'anno'>> & Pick<DetalleClaseCursada, 'nota'>) => Promise<void>;
}

export function HistorialClaseModal({ clase, onClose, onSave }: HistorialClaseModalProps) {
  const { periodo: periodoInicial, anno: annoInicial } = parsePeriodoAnno(clase.periodo, clase.anno);
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [anno, setAnno] = useState(annoInicial);
  const [nota, setNota] = useState(clase.nota ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const soloLectura = clase.oficial;
  const puedeGuardar = periodo !== '' && anno !== '';

  async function handleGuardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      await onSave({
        periodo: Number(periodo),
        anno: Number(anno),
        ...(nota !== '' && { nota: Number(nota) }),
      });
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo guardar el historial.');
    } finally {
      setGuardando(false);
    }
  }

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

        {error && <p className="page-error">{error}</p>}

        {soloLectura ? (
          <p className="page-warning">
            Esta clase ya está registrada oficialmente por el administrador; no puedes modificar su historial desde aquí.
          </p>
        ) : (
          <div className="inline-form inline-form-end">
            <label className="field">
              Período
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                <option value="">Selecciona…</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
            <label className="field">
              Año
              <input
                type="number"
                min={2000}
                max={2100}
                style={{ width: 100 }}
                value={anno}
                onChange={(e) => setAnno(e.target.value)}
              />
            </label>
            <label className="field">
              Nota
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                style={{ width: 90 }}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </label>
          </div>
        )}

        {!soloLectura && (
          <div className="modal-footer">
            <div className="inline-form">
              <button className="btn btn-secondary" disabled={guardando} onClick={onClose}>
                Cancelar
              </button>
              <button
                className={`btn btn-primary ${guardando ? 'btn-loading' : ''}`}
                disabled={guardando || !puedeGuardar}
                onClick={handleGuardar}
              >
                Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}