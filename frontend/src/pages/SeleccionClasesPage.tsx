import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCatalogo, getPeriodosDisponibles } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import type { CatalogoDisponible, PeriodoDisponible } from '../estudiante/types';

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function etiquetaPeriodo(p: { anno: string; periodo: string }): string {
  return `${p.anno} - Período ${p.periodo}`;
}

function etiquetaEstado(estado: string): string {
  return estado === 'habilitado' ? 'Habilitado' : 'Deshabilitado';
}

export function SeleccionClasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [periodos, setPeriodos] = useState<PeriodoDisponible[]>([]);
  const [periodoId, setPeriodoId] = useState<string>('');
  const [periodoConfirmado, setPeriodoConfirmado] = useState<PeriodoDisponible | null>(null);
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

        // Un período pedido por query param (ej. enlace externo o URL editada
        // a mano) solo puede pre-cargar la elección en el selector: si no está
        // entre los habilitados se rechaza con mensaje claro, y de todas
        // formas sigue exigiendo confirmación explícita (no se auto-confirma).
        const periodoSolicitado = searchParams.get('periodoId');
        if (periodoSolicitado) {
          const existe = disponibles.some((p) => p.id === periodoSolicitado);
          if (existe) {
            setPeriodoId(periodoSolicitado);
          } else {
            setError('El período indicado no existe o no está habilitado. Selecciona uno de la lista de períodos disponibles.');
            setPeriodoId(disponibles[0]?.id ?? '');
          }
          setSearchParams({}, { replace: true });
        } else {
          setPeriodoId(disponibles[0]?.id ?? '');
        }
      } catch (err) {
        setError(errorMessage(err, 'No se pudieron cargar los períodos académicos.'));
      } finally {
        setCargandoPeriodos(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const confirmarSeleccion = useCallback(async () => {
    const elegido = periodos.find((p) => p.id === periodoId);
    if (!elegido) {
      setError('Selecciona un período de la lista de disponibles antes de continuar.');
      return;
    }
    setCargandoCatalogo(true);
    setError(null);
    try {
      // El backend revalida existencia + estado habilitado del período: es la
      // fuente de verdad, incluso si esta elección viene precargada de la URL.
      const datos = await getCatalogo(elegido.id);
      setCatalogo(datos);
      setPeriodoConfirmado(elegido);
    } catch (err) {
      setCatalogo(null);
      setPeriodoConfirmado(null);
      setError(errorMessage(err, 'No se pudo confirmar el período seleccionado.'));
    } finally {
      setCargandoCatalogo(false);
    }
  }, [periodos, periodoId]);

  const cambiarPeriodo = useCallback(() => {
    setPeriodoConfirmado(null);
    setCatalogo(null);
    setError(null);
  }, []);

  // El período confirmado se muestra en una barra de contexto dentro del
  // encabezado (sticky), no en el cuerpo de la página: así queda visible en
  // todo momento mientras el estudiante navega/hace scroll en el catálogo,
  // en vez de perderse si el contenido de la página crece.
  const contextBar = periodoConfirmado ? (
    <div className="context-bar">
      <span>Simulando matrícula para el período</span>
      <strong>{etiquetaPeriodo(periodoConfirmado)}</strong>
      <span className={`badge ${periodoConfirmado.estado === 'habilitado' ? 'badge-success' : 'badge-neutral'}`}>
        {etiquetaEstado(periodoConfirmado.estado)}
      </span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={cambiarPeriodo}>
        Cambiar período
      </button>
    </div>
  ) : undefined;

  if (cargandoPeriodos) {
    return (
      <AppShell title="Inscripción" backTo="/estudiante" backLabel="Mi perfil">
        <p>Cargando…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Inscripción" backTo="/estudiante" backLabel="Mi perfil" contextBar={contextBar}>
      {error && <p className="page-error">{error}</p>}

      {!periodoConfirmado && (
        <section className="panel">
          <h2>Período académico</h2>
          {periodos.length === 0 ? (
            <p>No hay períodos académicos habilitados en este momento.</p>
          ) : (
            <div>
              <label className="field">
                Selecciona el período sobre el que deseas simular tu matrícula
                <select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
                  {periodos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {etiquetaPeriodo(p)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmarSeleccion}
                disabled={cargandoCatalogo}
              >
                {cargandoCatalogo ? 'Confirmando…' : 'Confirmar selección'}
              </button>
            </div>
          )}
        </section>
      )}

      {periodoConfirmado && catalogo && (
        <section className="panel">
          <h2>Catálogo de asignaturas</h2>
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
        </section>
      )}
    </AppShell>
  );
}
