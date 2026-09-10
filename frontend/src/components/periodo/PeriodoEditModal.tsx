import { useState } from 'react';
import type { UpdatePeriodoInput } from '../../api/periodoApi';
import type { Periodo } from '../../periodo/types';

interface PeriodoEditModalProps {
  periodo: Periodo;
  onClose: () => void;
  onSave: (dto: UpdatePeriodoInput) => Promise<void>;
}

export function PeriodoEditModal({ periodo, onClose, onSave }: PeriodoEditModalProps) {
  const [anno, setAnno] = useState(periodo.anno);
  const [periodoNum, setPeriodoNum] = useState(periodo.periodo);
  const [fechaInicio, setFechaInicio] = useState(periodo.fechaInicio?.slice(0, 10) ?? '');
  const [fechaFin, setFechaFin] = useState(periodo.fechaFin?.slice(0, 10) ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGuardar() {
    setGuardando(true);
    setError(null);
    try {
      await onSave({
        anno: Number(anno),
        periodo: Number(periodoNum),
        fechaInicio: fechaInicio || undefined,
        fechaFin: fechaFin || undefined,
      });
    } catch (err: unknown) {
      const mensaje =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No se pudo guardar el período.';
      setError(mensaje);
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Editar período</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {error && <p className="page-error">{error}</p>}

        <label className="field">
          Año
          <input type="number" value={anno} onChange={(e) => setAnno(e.target.value)} />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          Período
          <select value={periodoNum} onChange={(e) => setPeriodoNum(e.target.value)}>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          Fecha de inicio
          <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          Fecha de fin
          <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
        </label>

        <div className="modal-footer">
          <button className="btn btn-secondary" disabled={guardando} onClick={onClose}>
            Cancelar
          </button>
          <button
            className={`btn btn-primary ${guardando ? 'btn-loading' : ''}`}
            disabled={guardando}
            onClick={handleGuardar}
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
