import { useCallback, useEffect, useState } from 'react';
import { cambiarEstadoPeriodo, createPeriodo, listPeriodos, updatePeriodo } from '../api/periodoApi';
import { AppShell } from '../components/AppShell';
import { PeriodoEditModal } from '../components/periodo/PeriodoEditModal';
import type { Periodo } from '../periodo/types';

export function PeriodosPage() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nuevoAnno, setNuevoAnno] = useState('');
  const [nuevoPeriodo, setNuevoPeriodo] = useState('1');
  const [nuevaFechaInicio, setNuevaFechaInicio] = useState('');
  const [nuevaFechaFin, setNuevaFechaFin] = useState('');

  const [periodoEditando, setPeriodoEditando] = useState<Periodo | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPeriodos(await listPeriodos());
    } catch {
      setError('No se pudieron cargar los períodos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoAnno.trim()) return;
    try {
      await createPeriodo({
        anno: Number(nuevoAnno),
        periodo: Number(nuevoPeriodo),
        fechaInicio: nuevaFechaInicio || undefined,
        fechaFin: nuevaFechaFin || undefined,
      });
      setNuevoAnno('');
      setNuevaFechaInicio('');
      setNuevaFechaFin('');
      await cargar();
    } catch (err: unknown) {
      const mensaje =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'No se pudo crear el período. Verifica que el año y período no estén repetidos.';
      setError(mensaje);
    }
  }

  async function onToggleEstado(periodo: Periodo) {
    try {
      await cambiarEstadoPeriodo(periodo.id, periodo.estado === 'habilitado' ? 'deshabilitado' : 'habilitado');
      await cargar();
    } catch {
      setError('No se pudo actualizar el estado del período.');
    }
  }

  async function onGuardarEdicion(dto: Parameters<typeof updatePeriodo>[1]) {
    if (!periodoEditando) return;
    await updatePeriodo(periodoEditando.id, dto);
    setPeriodoEditando(null);
    await cargar();
  }

  return (
    <AppShell title="Períodos académicos" backTo="/admin" backLabel="Panel">
      {error && <p className="page-error">{error}</p>}

      <section className="panel">
        <h2>Nuevo período</h2>
        <form className="inline-form inline-form-end" onSubmit={onCrear}>
          <label className="field">
            Año
            <input
              type="number"
              placeholder="p. ej. 2026"
              value={nuevoAnno}
              onChange={(e) => setNuevoAnno(e.target.value)}
            />
          </label>
          <label className="field">
            Período
            <select value={nuevoPeriodo} onChange={(e) => setNuevoPeriodo(e.target.value)}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <label className="field">
            Fecha de inicio
            <input type="date" value={nuevaFechaInicio} onChange={(e) => setNuevaFechaInicio(e.target.value)} />
          </label>
          <label className="field">
            Fecha de fin
            <input type="date" value={nuevaFechaFin} onChange={(e) => setNuevaFechaFin(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary">
            Crear período
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Períodos existentes</h2>
        {loading ? (
          <p>Cargando…</p>
        ) : periodos.length === 0 ? (
          <p>No hay períodos registrados todavía.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Período</th>
                  <th>Estado</th>
                  <th>Fecha de inicio</th>
                  <th>Fecha de fin</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.anno}</td>
                    <td>{p.periodo}</td>
                    <td>
                      <span className={`badge ${p.estado === 'habilitado' ? 'badge-success' : 'badge-neutral'}`}>
                        {p.estado === 'habilitado' ? 'Habilitado' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td>{p.fechaInicio?.slice(0, 10) ?? '—'}</td>
                    <td>{p.fechaFin?.slice(0, 10) ?? '—'}</td>
                    <td className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => setPeriodoEditando(p)}>
                        Editar
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => onToggleEstado(p)}>
                        {p.estado === 'habilitado' ? 'Deshabilitar' : 'Habilitar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {periodoEditando && (
        <PeriodoEditModal
          periodo={periodoEditando}
          onClose={() => setPeriodoEditando(null)}
          onSave={onGuardarEdicion}
        />
      )}
    </AppShell>
  );
}
