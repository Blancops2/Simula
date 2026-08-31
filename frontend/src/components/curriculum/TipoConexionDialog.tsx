import type { TipoRequisito } from '../../curriculum/types';

interface TipoConexionDialogProps {
  requisitoCodigo: string;
  claseCodigo: string;
  onElegir: (tipo: TipoRequisito) => void;
  onCancelar: () => void;
  procesando: boolean;
  error: string | null;
}

export function TipoConexionDialog({
  requisitoCodigo,
  claseCodigo,
  onElegir,
  onCancelar,
  procesando,
  error,
}: TipoConexionDialogProps) {
  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <h2>Nueva relación</h2>
        <p>
          <strong>{requisitoCodigo}</strong> habilitaría a <strong>{claseCodigo}</strong>. ¿Qué tipo de relación es?
        </p>
        {error && <p className="page-error">{error}</p>}
        <div className="inline-form">
          <button className="btn btn-primary" disabled={procesando} onClick={() => onElegir('PRERREQUISITO')}>
            Prerrequisito
          </button>
          <button className="btn btn-secondary" disabled={procesando} onClick={() => onElegir('CORREQUISITO')}>
            Correquisito
          </button>
          <button className="btn btn-ghost" disabled={procesando} onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
