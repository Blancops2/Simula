import { Fragment, useEffect, useState } from 'react';
import { getSimulacion, getSimulacionesPeriodoActual } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import { porcentaje, ResultadoSimulacion, RIESGO_UI } from '../components/simulacion/ResultadoSimulacion';
import { errorDeFalla } from '../estudiante/errorSimulacion';
import type { ResumenSimulacion, SimulacionCarga, SimulacionesPeriodoActual } from '../estudiante/types';

// Trazabilidad (criterio 4): últimas simulaciones del estudiante en el
// período actual, incluidas las fallidas. La lista es un resumen; el detalle
// se pide al abrir cada una (GET /estudiante/simulaciones/:id).

const FORMATO_FECHA = new Intl.DateTimeFormat('es-HN', { dateStyle: 'long', timeStyle: 'short' });

function fechaHora(iso: string | null): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? '—' : FORMATO_FECHA.format(fecha);
}

function Resultado({ simulacion }: { simulacion: ResumenSimulacion }) {
  if (simulacion.disponible && simulacion.probabilidadAprobarTodo !== null) {
    const ui = simulacion.riesgo ? RIESGO_UI[simulacion.riesgo] : undefined;
    return (
      <span className={`badge ${ui?.badge ?? 'badge-neutral'}`}>
        {porcentaje(simulacion.probabilidadAprobarTodo)}
        {ui && ` · ${ui.etiqueta}`}
      </span>
    );
  }
  return <span className="tree-node-meta">{errorDeFalla(simulacion.falla ?? 'NO_DISPONIBLE').titulo}</span>;
}

type Detalle = { cargando: true } | { cargando: false; simulacion: SimulacionCarga | null };

export function SimulacionesAnterioresPage() {
  const [datos, setDatos] = useState<SimulacionesPeriodoActual | null>(null);
  const [error, setError] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, Detalle>>({});

  useEffect(() => {
    getSimulacionesPeriodoActual()
      .then(setDatos)
      .catch(() => setError(true));
  }, []);

  function alternarDetalle(id: string) {
    if (abierta === id) {
      setAbierta(null);
      return;
    }
    setAbierta(id);
    if (detalles[id] && (detalles[id].cargando || detalles[id].simulacion)) return;
    setDetalles((d) => ({ ...d, [id]: { cargando: true } }));
    getSimulacion(id)
      .then((simulacion) => setDetalles((d) => ({ ...d, [id]: { cargando: false, simulacion } })))
      .catch(() => setDetalles((d) => ({ ...d, [id]: { cargando: false, simulacion: null } })));
  }

  function contenidoDetalle(resumen: ResumenSimulacion) {
    const detalle = detalles[resumen.idSimulacion];
    if (!detalle || detalle.cargando) return <p className="tree-node-meta">Cargando detalle…</p>;
    if (!detalle.simulacion) return <p className="simulacion-aviso">No se pudo cargar el detalle de esta simulación.</p>;
    if (!detalle.simulacion.disponible) {
      const falla = errorDeFalla(detalle.simulacion.falla ?? 'NO_DISPONIBLE');
      return (
        <p className="simulacion-aviso">
          <strong>{falla.titulo}.</strong> {falla.mensaje}
        </p>
      );
    }
    return <ResultadoSimulacion simulacion={detalle.simulacion} />;
  }

  return (
    <AppShell title="Simulaciones anteriores" backTo="/estudiante/malla" backLabel="Inscripción">
      <section className="panel">
        {error ? (
          <p className="page-error">No se pudieron cargar tus simulaciones anteriores.</p>
        ) : !datos ? (
          <p>Cargando…</p>
        ) : !datos.periodo ? (
          <p>Todavía no hay un período actual definido. Consulta con la administración.</p>
        ) : (
          <>
            <h2>
              Período {datos.periodo.anno} - {datos.periodo.periodo}
            </h2>
            {datos.simulaciones.length === 0 ? (
              <p>No has hecho simulaciones en el período actual.</p>
            ) : (
              <>
                <p className="tree-node-meta">
                  {datos.simulaciones.length === 1
                    ? 'Tu última simulación en este período.'
                    : `Tus últimas ${datos.simulaciones.length} simulaciones en este período, de la más reciente a la más antigua.`}
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Asignaturas</th>
                        <th>U.V.</th>
                        <th>Resultado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.simulaciones.map((s) => (
                        <Fragment key={s.idSimulacion}>
                          <tr>
                            <td>{fechaHora(s.fechaGeneracion)}</td>
                            <td>
                              {s.clases.map((c) => (
                                <div key={c.codigo}>
                                  {c.nombre || c.codigo} <span className="tree-node-meta">{c.codigo}</span>
                                </div>
                              ))}
                            </td>
                            <td>
                              {s.totalUnidadesValorativas} / {s.limiteUnidadesValorativas}
                            </td>
                            <td>
                              <Resultado simulacion={s} />
                              {s.origenModelo === 'mock' && (
                                <div>
                                  <span className="badge badge-neutral" title="Respondida por un modelo de prueba (mock)">
                                    Ilustrativo
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="table-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => alternarDetalle(s.idSimulacion)}
                                aria-expanded={abierta === s.idSimulacion}
                              >
                                {abierta === s.idSimulacion ? 'Ocultar detalle' : 'Ver detalle'}
                              </button>
                            </td>
                          </tr>
                          {abierta === s.idSimulacion && (
                            <tr>
                              <td colSpan={5}>{contenidoDetalle(s)}</td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
