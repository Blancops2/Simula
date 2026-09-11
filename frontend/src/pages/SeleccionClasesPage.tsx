import { useCallback, useEffect, useState } from 'react';
import { getCatalogo, getPeriodosDisponibles } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import type { CatalogoDisponible, PeriodoDisponible } from '../estudiante/types';

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function etiquetaPeriodo(p: { anno: string; periodo: string }): string {
  return `${p.anno} - Período ${p.periodo}`;
}

export function SeleccionClasesPage() {
  const [periodos, setPeriodos] = useState<PeriodoDisponible[]>([]);
  const [periodoId, setPeriodoId] = useState<string>('');
  const [catalogo, setCatalogo] = useState<CatalogoDisponible | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargandoPeriodos, setCargandoPeriodos] = useState(true);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);

  useEffect(() => {
    (async () => {
      setCargandoPeriodos(true);
      setError(null);
      try {
        const disponibles = await getPeriodosDisponibles();
        setPeriodos(disponibles);
        setPeriodoId(disponibles[0]?.id ?? '');
      } catch (err) {
        setError(errorMessage(err, 'No se pudieron cargar los períodos académicos.'));
      } finally {
        setCargandoPeriodos(false);
      }
    })();
  }, []);

  const cargarCatalogo = useCallback(async (id: string) => {
    setCargandoCatalogo(true);
    setError(null);
    try {
      setCatalogo(await getCatalogo(id));
    } catch (err) {
      setCatalogo(null);
      setError(errorMessage(err, 'No se pudo cargar el catálogo de asignaturas.'));
    } finally {
      setCargandoCatalogo(false);
    }
  }, []);

  useEffect(() => {
    if (periodoId) {
      cargarCatalogo(periodoId);
    } else {
      setCatalogo(null);
    }
  }, [periodoId, cargarCatalogo]);

  if (cargandoPeriodos) {
    return (
      <AppShell title="Inscripción" backTo="/estudiante" backLabel="Mi perfil">
        <p>Cargando…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Inscripción" backTo="/estudiante" backLabel="Mi perfil">
      {error && <p className="page-error">{error}</p>}

      <section className="panel">
        <h2>Catálogo de asignaturas</h2>
        {periodos.length === 0 ? (
          <p>No hay períodos académicos habilitados en este momento.</p>
        ) : (
          <label className="field">
            Período académico
            <select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {etiquetaPeriodo(p)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {cargandoCatalogo ? (
        <p>Cargando catálogo…</p>
      ) : catalogo ? (
        <>
          <p className="tree-node-meta">Plan de estudios: {catalogo.plantilla.nombre}</p>

          {catalogo.niveles.length === 0 ? (
            <p>No hay asignaturas disponibles para el período {etiquetaPeriodo(catalogo.periodo)}.</p>
          ) : (
            <div className="catalog-scroll">
              <section className="tree">
                {catalogo.niveles.map((n) => (
                  <div key={n.nivel} className="tree-level">
                    <h3 className="tree-level-title">Nivel {n.nivel}</h3>
                    <div className="tree-nodes">
                      {n.clases.map((clase) => (
                        <div key={clase.id} className="tree-node tree-node-disponible">
                          <div className="tree-node-title">
                            <strong>{clase.codigo}</strong> — {clase.nombre}
                          </div>
                          <div className="tree-node-meta">
                            {clase.unidadesValorativas} U.V. ·{' '}
                            {clase.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Electiva'}
                          </div>

                          {clase.prerrequisitos.length > 0 && (
                            <div className="tree-node-meta">
                              Prerrequisitos: {clase.prerrequisitos.map((p) => p.codigo).join(', ')}
                            </div>
                          )}
                          {clase.correquisitos.length > 0 && (
                            <div className="tree-node-meta">
                              Correquisitos: {clase.correquisitos.map((p) => p.codigo).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
