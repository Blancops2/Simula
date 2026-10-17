import type { NivelRiesgo, SimulacionCarga } from '../../estudiante/types';

// HU-05-07: resultado de una simulación evaluada, ligado a la carga que se
// simuló. Las filas salen de `carga` (lo que se envió al modelo, siempre
// presente) y se cruzan por código con `clases` (lo que el modelo evaluó):
// una asignatura sin resultado o un campo vacío se muestra como "Sin
// información" en vez de romper la vista o inventar un 0 %.

export const RIESGO_UI: Record<NivelRiesgo, { etiqueta: string; badge: string }> = {
  BAJO: { etiqueta: 'Riesgo bajo', badge: 'badge-success' },
  MEDIO: { etiqueta: 'Riesgo medio', badge: 'badge-warning' },
  ALTO: { etiqueta: 'Riesgo alto', badge: 'badge-danger' },
};

export function porcentaje(probabilidad: number): string {
  return `${Math.round(probabilidad * 100)}%`;
}

const SIN_INFORMACION = 'Sin información';

const FORMATO_FECHA = new Intl.DateTimeFormat('es-HN', { dateStyle: 'long', timeStyle: 'short' });

function fechaHora(iso: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : FORMATO_FECHA.format(fecha);
}

function etiquetaPeriodo(periodo: SimulacionCarga['periodo'] | null | undefined): string | null {
  if (!periodo?.anno && !periodo?.periodo) return null;
  return `${periodo.anno || '—'} - Período ${periodo.periodo || '—'}`;
}

function SinInformacion() {
  return <em className="simulacion-sin-info">{SIN_INFORMACION}</em>;
}

function Probabilidad({ probabilidad, riesgo }: { probabilidad: number | null | undefined; riesgo: NivelRiesgo | null | undefined }) {
  if (probabilidad === null || probabilidad === undefined || !Number.isFinite(probabilidad)) {
    return <SinInformacion />;
  }
  const ui = riesgo ? RIESGO_UI[riesgo] : undefined;
  return (
    <span className={`badge ${ui?.badge ?? 'badge-neutral'}`}>
      {porcentaje(probabilidad)}
      {ui && ` · ${ui.etiqueta}`}
    </span>
  );
}

// Sin `onSimularDeNuevo`/`onModificarCarga` (p. ej. al ver una simulación
// anterior) no se muestran las acciones: esa carga ya no es necesariamente
// la inscrita.
interface ResultadoSimulacionProps {
  simulacion: SimulacionCarga;
  onSimularDeNuevo?: () => void;
  simularDeshabilitado?: boolean;
  onModificarCarga?: () => void;
}

export function ResultadoSimulacion({
  simulacion,
  onSimularDeNuevo,
  simularDeshabilitado,
  onModificarCarga,
}: ResultadoSimulacionProps) {
  const evaluacionPorCodigo = new Map((simulacion.clases ?? []).map((c) => [c.codigo, c]));
  const carga = simulacion.carga ?? [];
  const observaciones = simulacion.observaciones ?? [];
  const periodo = etiquetaPeriodo(simulacion.periodo);
  const generada = fechaHora(simulacion.fechaGeneracion);

  return (
    <div className="simulacion-resultado" role="region" aria-label="Resultado de la simulación">
      <div className="simulacion-encabezado">
        <h4 className="simulacion-titulo">Resultado de la simulación</h4>
        <span className="tree-node-meta">
          Período: {periodo ?? SIN_INFORMACION} · Generada: {generada ?? SIN_INFORMACION}
        </span>
      </div>

      {simulacion.origenModelo === 'mock' && (
        <p className="simulacion-ilustrativa" role="note">
          <strong>Resultados ilustrativos.</strong> Esta simulación la respondió un modelo de prueba (mock), no el
          modelo predictivo real: las probabilidades no son predicciones y no deben usarse para decidir tu carga.
        </p>
      )}

      <div className="simulacion-total">
        <span>Probabilidad de aprobar toda la carga</span>
        <Probabilidad probabilidad={simulacion.probabilidadAprobarTodo} riesgo={simulacion.riesgo} />
      </div>
      <span className="tree-node-meta">
        {carga.length} {carga.length === 1 ? 'asignatura' : 'asignaturas'} · Unidades valorativas:{' '}
        {simulacion.totalUnidadesValorativas ?? '—'} / {simulacion.limiteUnidadesValorativas ?? '—'}
      </span>

      {observaciones.length > 0 && (
        <ul className="simulacion-factores">
          {observaciones.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Asignatura</th>
              <th>U.V.</th>
              <th>Probabilidad de aprobar</th>
              <th>Factores</th>
            </tr>
          </thead>
          <tbody>
            {carga.map((c) => {
              const evaluacion = evaluacionPorCodigo.get(c.codigo);
              const nombre = c.nombre || evaluacion?.nombre;
              const factores = evaluacion?.factores ?? [];
              return (
                <tr key={c.codigo}>
                  <td>
                    {nombre ? <span>{nombre}</span> : <SinInformacion />}
                    <div className="tree-node-meta">{c.codigo}</div>
                  </td>
                  <td>{c.unidadesValorativas ?? '—'}</td>
                  <td>
                    <Probabilidad probabilidad={evaluacion?.probabilidadAprobacion} riesgo={evaluacion?.riesgo} />
                  </td>
                  <td>
                    {factores.length > 0 ? (
                      <ul className="simulacion-factores">
                        {factores.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      <SinInformacion />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onSimularDeNuevo && onModificarCarga && (
        <div className="simulacion-acciones">
          <span className="tree-node-meta">
            ¿Quieres ajustar tu carga? Inscribe o cancela asignaturas y vuelve a simular.
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onModificarCarga}>
            Modificar carga
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onSimularDeNuevo}
            disabled={simularDeshabilitado}
          >
            Simular de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
