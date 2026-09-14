import { useEffect, useRef, useState } from 'react';
import type { ClaseView } from '../../curriculum/types';
import type { PlanEstudioPeriodo } from '../../planEstudio/types';

interface PlanEstudioPeriodoCardProps {
  periodoItem: PlanEstudioPeriodo;
  clasesDisponibles: ClaseView[];
  // Ids de clases ya recomendadas en CUALQUIER periodo de esta malla (no
  // solo este): se excluyen del buscador para no ofrecer la misma clase en
  // dos periodos distintos.
  clasesUsadasIds: Set<string>;
  onAgregarClase: (periodoId: string, claseId: string) => Promise<void>;
  onQuitarClase: (periodoId: string, claseId: string) => Promise<void>;
  onEliminarPeriodo: (periodoId: string) => Promise<void>;
  // A diferencia de los demás callbacks, este NO debe atrapar sus propios
  // errores: los deja propagar para que la tarjeta los muestre junto al
  // formulario (p. ej. "ya existe ese año/periodo"), en vez de mandarlos al
  // error global de la página.
  onEditarEtiqueta: (periodoId: string, dto: { anno: string; periodo: string }) => Promise<void>;
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function PlanEstudioPeriodoCard({
  periodoItem,
  clasesDisponibles,
  clasesUsadasIds,
  onAgregarClase,
  onQuitarClase,
  onEliminarPeriodo,
  onEditarEtiqueta,
}: PlanEstudioPeriodoCardProps) {
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const buscadorRef = useRef<HTMLDivElement>(null);

  const [editando, setEditando] = useState(false);
  const [annoDraft, setAnnoDraft] = useState(periodoItem.anno);
  const [periodoDraft, setPeriodoDraft] = useState(periodoItem.periodo);
  const [guardandoEtiqueta, setGuardandoEtiqueta] = useState(false);
  const [errorEtiqueta, setErrorEtiqueta] = useState<string | null>(null);

  useEffect(() => {
    if (!buscadorAbierto) return;
    function onClickFuera(e: MouseEvent) {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target as Node)) {
        setBuscadorAbierto(false);
      }
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, [buscadorAbierto]);

  const clasesAsignadas = periodoItem.clasesIds
    .map((id) => clasesDisponibles.find((c) => c.id === id))
    .filter((c): c is ClaseView => !!c);

  const q = query.trim().toLowerCase();
  // Sin límite artificial: el contenedor de sugerencias ya tiene scroll
  // propio (.requisito-picker-suggestions, max-height 220px), así que puede
  // mostrar toda la malla en vez de solo una muestra parcial.
  const sugerencias = clasesDisponibles
    .filter((c) => !clasesUsadasIds.has(c.id))
    .filter((c) => q.length === 0 || c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q));

  async function agregar(claseId: string) {
    setBusy(`agregar-${claseId}`);
    try {
      await onAgregarClase(periodoItem.id, claseId);
      setQuery('');
    } finally {
      setBusy(null);
    }
  }

  async function quitar(claseId: string) {
    setBusy(`quitar-${claseId}`);
    try {
      await onQuitarClase(periodoItem.id, claseId);
    } finally {
      setBusy(null);
    }
  }

  async function eliminarPeriodo() {
    if (!window.confirm(`¿Eliminar "${periodoItem.periodo}" y sus clases recomendadas?`)) return;
    setBusy('eliminar-periodo');
    try {
      await onEliminarPeriodo(periodoItem.id);
    } finally {
      setBusy(null);
    }
  }

  function empezarEdicion() {
    setAnnoDraft(periodoItem.anno);
    setPeriodoDraft(periodoItem.periodo);
    setErrorEtiqueta(null);
    setEditando(true);
  }

  async function guardarEtiqueta() {
    if (!annoDraft.trim() || !periodoDraft.trim()) return;
    setGuardandoEtiqueta(true);
    setErrorEtiqueta(null);
    try {
      await onEditarEtiqueta(periodoItem.id, { anno: annoDraft.trim(), periodo: periodoDraft.trim() });
      setEditando(false);
    } catch (err) {
      setErrorEtiqueta(errorMessage(err, 'No se pudo guardar. Verifica que no esté repetido en esta plantilla.'));
    } finally {
      setGuardandoEtiqueta(false);
    }
  }

  return (
    <div className="tree-level">
      <div className="tree-level-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {editando ? (
          <div className="inline-form" style={{ margin: 0 }}>
            <label className="field">
              Año
              <input value={annoDraft} onChange={(e) => setAnnoDraft(e.target.value)} disabled={guardandoEtiqueta} />
            </label>
            <label className="field">
              Periodo
              <input
                value={periodoDraft}
                onChange={(e) => setPeriodoDraft(e.target.value)}
                disabled={guardandoEtiqueta}
              />
            </label>
          </div>
        ) : (
          <h3 style={{ margin: 0 }}>{periodoItem.periodo}</h3>
        )}

        <div className="table-actions">
          {editando ? (
            <>
              <button type="button" className="btn btn-secondary btn-sm" disabled={guardandoEtiqueta} onClick={() => setEditando(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={guardandoEtiqueta || !annoDraft.trim() || !periodoDraft.trim()}
                onClick={guardarEtiqueta}
              >
                {guardandoEtiqueta ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={empezarEdicion}>
                Editar
              </button>
              <div ref={buscadorRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setBuscadorAbierto((v) => !v)}
                >
                  {buscadorAbierto ? 'Cerrar' : 'Agregar clase'}
                </button>

                {buscadorAbierto && (
                  <div
                    className="requisito-picker"
                    style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 320, zIndex: 20 }}
                  >
                    <div className="requisito-picker-input-wrap">
                      <input
                        autoFocus
                        placeholder="Buscar clase por código o nombre…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {sugerencias.length > 0 && (
                        <ul className="requisito-picker-suggestions">
                          {sugerencias.map((c) => (
                            <li key={c.id}>
                              <button type="button" disabled={busy === `agregar-${c.id}`} onClick={() => agregar(c.id)}>
                                <strong>{c.codigo}</strong> — {c.nombre}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={busy === 'eliminar-periodo'}
                onClick={eliminarPeriodo}
              >
                {busy === 'eliminar-periodo' ? 'Eliminando…' : 'Eliminar periodo'}
              </button>
            </>
          )}
        </div>
      </div>

      {editando && errorEtiqueta && <p className="page-error">{errorEtiqueta}</p>}

      {clasesAsignadas.length === 0 ? (
        <p>Este periodo todavía no tiene clases recomendadas.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Clase</th>
                <th>Nivel</th>
                <th>U.V.</th>
                <th>Tipo</th>
                <th>Requisitos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clasesAsignadas.map((c) => (
                <tr key={c.id}>
                  <td>{c.codigo}</td>
                  <td>{c.nombre}</td>
                  <td>{c.nivel}</td>
                  <td>{c.unidadesValorativas}</td>
                  <td>{c.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Electiva'}</td>
                  <td>{[...c.prerrequisitos, ...c.correquisitos].map((r) => r.codigo).join(', ') || 'Ninguno'}</td>
                  <td className="table-actions">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busy === `quitar-${c.id}`}
                      onClick={() => quitar(c.id)}
                    >
                      {busy === `quitar-${c.id}` ? 'Eliminando…' : 'Eliminar clase'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
