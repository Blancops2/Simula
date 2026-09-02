import { useEffect, useState } from 'react';
import { getHistorial } from '../api/estudianteApi';
import { AppShell } from '../components/AppShell';
import { formatPeriodo } from '../estudiante/periodo';
import type { HistorialItem } from '../estudiante/types';

const ETIQUETAS_ESTADO: Record<HistorialItem['estado'], string> = {
  APROBADA: 'Aprobada',
  REPROBADA: 'Reprobada',
  EN_CURSO: 'En curso',
};

export function HistorialPage() {
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHistorial()
      .then(setHistorial)
      .catch(() => setError('No se pudo cargar tu historial.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell title="Historial de clases cursadas" backTo="/estudiante" backLabel="Mi perfil">
      {error && <p className="page-error">{error}</p>}

      <section className="panel">
        {loading ? (
          <p>Cargando…</p>
        ) : historial.length === 0 ? (
          <p>Todavía no tienes clases registradas en tu historial.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Clase</th>
                  <th>Nivel</th>
                  <th>U.V.</th>
                  <th>Período</th>
                  <th>Año</th>
                  <th>Estado</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{h.clase.codigo}</td>
                    <td>{h.clase.nombre}</td>
                    <td>{h.clase.nivel}</td>
                    <td>{h.clase.unidadesValorativas}</td>
                    <td>{formatPeriodo(h.periodo, h.anno)}</td>
                    <td>{h.anno ?? '—'}</td>
                    <td>
                      <span className={`badge status-${h.estado.toLowerCase()}`}>
                        {ETIQUETAS_ESTADO[h.estado]}
                      </span>
                    </td>
                    <td>{h.nota ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
