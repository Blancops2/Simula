import { useEffect, useMemo, useState } from 'react';
import { getPlanEstudio } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import type { ClaseConEstado, PlanEstudioPeriodoConEstado } from '../estudiante/types';

const ETIQUETAS_ESTADO: Record<ClaseConEstado['estadoEstudiante'], string> = {
  APROBADA: 'Aprobada',
  EN_CURSO: 'En curso',
  DISPONIBLE: 'Disponible',
  BLOQUEADA: 'Bloqueada',
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function EstudiantePlanEstudioPage() {
  const [periodos, setPeriodos] = useState<PlanEstudioPeriodoConEstado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlanEstudio()
      .then(setPeriodos)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el plan de estudio.')))
      .finally(() => setLoading(false));
  }, []);

  // Mismo agrupamiento por año que usa el admin: preserva el orden en que
  // vienen los periodos (orden de creación en el backend).
  const gruposPorAnno = useMemo(() => {
    const mapa = new Map<string, PlanEstudioPeriodoConEstado[]>();
    periodos.forEach((p) => {
      const lista = mapa.get(p.anno) ?? [];
      lista.push(p);
      mapa.set(p.anno, lista);
    });
    return [...mapa.entries()];
  }, [periodos]);

  return (
    <AppShell title="Plan de estudio recomendado" backTo="/estudiante" backLabel="Mi perfil">
      {error && <p className="page-error">{error}</p>}

      <section className="panel">
        <h2>Secuencia sugerida</h2>
        <p className="tree-node-meta">
          Es solo una recomendación de tu carrera: no seguirla en este orden no te bloquea. Las clases que ya
          aprobaste aparecen resaltadas en verde.
        </p>

        {loading ? (
          <p>Cargando…</p>
        ) : periodos.length === 0 ? (
          <p>Tu carrera todavía no tiene un plan de estudio recomendado.</p>
        ) : (
          gruposPorAnno.map(([anno, items]) => (
            <div key={anno} className="plan-estudio-anno">
              <h3 className="plan-estudio-anno-title">{anno}</h3>
              {items.map((p) => (
                <div key={p.id} className="tree-level">
                  <h3 className="tree-level-title">{p.periodo}</h3>
                  {p.clases.length === 0 ? (
                    <p>Este periodo no tiene clases recomendadas todavía.</p>
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
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.clases.map((c) => (
                            <tr key={c.id} className={c.estadoEstudiante === 'APROBADA' ? 'row-aprobada' : ''}>
                              <td>{c.codigo}</td>
                              <td>{c.nombre}</td>
                              <td>{c.nivel}</td>
                              <td>{c.unidadesValorativas}</td>
                              <td>{c.tipo === 'OBLIGATORIA' ? 'Obligatoria' : 'Electiva'}</td>
                              <td>
                                {[...c.prerrequisitos, ...c.correquisitos].map((r) => r.codigo).join(', ') ||
                                  'Ninguno'}
                              </td>
                              <td>
                                <span className={`badge status-${c.estadoEstudiante.toLowerCase()}`}>
                                  {ETIQUETAS_ESTADO[c.estadoEstudiante]}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </AppShell>
  );
}
