import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPlantillaArbol, listCarreras, listPlantillas } from '../api/curriculumApi';
import {
  createPlanEstudioPeriodo,
  deletePlanEstudioPeriodo,
  listPlanEstudio,
  updatePlanEstudioPeriodo,
} from '../api/planEstudioApi';
import { AppShell } from '../components/AppShell';
import { PlanEstudioPeriodoCard } from '../components/planEstudio/PlanEstudioPeriodoCard';
import type { Carrera, ClaseView, PlantillaResumen } from '../curriculum/types';
import type { PlanEstudioPeriodo } from '../planEstudio/types';

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export function PlanEstudioPage() {
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [carreraId, setCarreraId] = useState('');

  const [plantillas, setPlantillas] = useState<PlantillaResumen[]>([]);
  const [plantillaId, setPlantillaId] = useState('');

  const [clasesDisponibles, setClasesDisponibles] = useState<ClaseView[]>([]);
  const [periodos, setPeriodos] = useState<PlanEstudioPeriodo[]>([]);

  const [nuevoAnnoLabel, setNuevoAnnoLabel] = useState('');
  const [nuevoPeriodoLabel, setNuevoPeriodoLabel] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCarreras()
      .then(setCarreras)
      .catch(() => setError('No se pudieron cargar las carreras.'));
  }, []);

  useEffect(() => {
    setPlantillaId('');
    setPlantillas([]);
    if (!carreraId) return;
    listPlantillas(carreraId)
      .then(setPlantillas)
      .catch(() => setError('No se pudieron cargar las plantillas de esta carrera.'));
  }, [carreraId]);

  const cargarPlanEstudio = useCallback(async () => {
    if (!plantillaId) return;
    setLoading(true);
    setError(null);
    try {
      const [arbol, planes] = await Promise.all([getPlantillaArbol(plantillaId), listPlanEstudio(plantillaId)]);
      setClasesDisponibles(arbol.niveles.flatMap((n) => n.clases));
      setPeriodos(planes);
    } catch {
      setError('No se pudo cargar el plan de estudio de esta plantilla.');
    } finally {
      setLoading(false);
    }
  }, [plantillaId]);

  useEffect(() => {
    if (!plantillaId) {
      setClasesDisponibles([]);
      setPeriodos([]);
      return;
    }
    cargarPlanEstudio();
  }, [plantillaId, cargarPlanEstudio]);

  // Agrupa por año preservando el orden de creación (el mismo que devuelve
  // el backend): así el admin controla el orden visual creando "primer
  // año" antes que "segundo año", sin depender de que el texto ordene bien.
  const gruposPorAnno = useMemo(() => {
    const mapa = new Map<string, PlanEstudioPeriodo[]>();
    periodos.forEach((p) => {
      const lista = mapa.get(p.anno) ?? [];
      lista.push(p);
      mapa.set(p.anno, lista);
    });
    return [...mapa.entries()];
  }, [periodos]);

  // Todas estas mutaciones actualizan el estado local con la respuesta del
  // backend en vez de recargar todo el plan (cargarPlanEstudio) desde cero:
  // un reload completo alterna `loading` y desmonta momentáneamente la
  // lista de tarjetas, lo que perdía el estado local de cada una (el
  // buscador abierto) y hacía saltar el scroll hacia arriba.

  async function onCrearPeriodo(e: React.FormEvent) {
    e.preventDefault();
    if (!plantillaId || !nuevoAnnoLabel.trim() || !nuevoPeriodoLabel.trim()) return;
    try {
      const nuevo = await createPlanEstudioPeriodo(plantillaId, nuevoAnnoLabel.trim(), nuevoPeriodoLabel.trim());
      setPeriodos((prev) => [...prev, nuevo]);
      setNuevoPeriodoLabel('');
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el periodo. Verifica que no esté repetido en esta plantilla.'));
    }
  }

  async function onAgregarClase(periodoId: string, claseId: string) {
    const actual = periodos.find((p) => p.id === periodoId);
    if (!actual) return;
    try {
      const actualizado = await updatePlanEstudioPeriodo(periodoId, {
        clasesIds: [...actual.clasesIds, claseId],
      });
      setPeriodos((prev) => prev.map((p) => (p.id === periodoId ? actualizado : p)));
    } catch (err) {
      setError(errorMessage(err, 'No se pudo agregar la clase a este periodo.'));
    }
  }

  async function onQuitarClase(periodoId: string, claseId: string) {
    const actual = periodos.find((p) => p.id === periodoId);
    if (!actual) return;
    try {
      const actualizado = await updatePlanEstudioPeriodo(periodoId, {
        clasesIds: actual.clasesIds.filter((id) => id !== claseId),
      });
      setPeriodos((prev) => prev.map((p) => (p.id === periodoId ? actualizado : p)));
    } catch (err) {
      setError(errorMessage(err, 'No se pudo quitar la clase de este periodo.'));
    }
  }

  // A diferencia de los demás handlers, este NO atrapa el error: lo deja
  // propagar para que la tarjeta lo muestre localmente junto al formulario
  // (p. ej. "ya existe ese año/periodo en esta plantilla").
  async function onEditarEtiqueta(periodoId: string, dto: { anno: string; periodo: string }) {
    const actualizado = await updatePlanEstudioPeriodo(periodoId, dto);
    setPeriodos((prev) => prev.map((p) => (p.id === periodoId ? actualizado : p)));
  }

  async function onEliminarPeriodo(periodoId: string) {
    try {
      await deletePlanEstudioPeriodo(periodoId);
      setPeriodos((prev) => prev.filter((p) => p.id !== periodoId));
    } catch (err) {
      setError(errorMessage(err, 'No se pudo eliminar el periodo.'));
    }
  }

  // Una clase ya recomendada en CUALQUIER periodo de esta malla no debe
  // volver a ofrecerse en el buscador de ningún otro periodo.
  const clasesUsadasIds = useMemo(() => new Set(periodos.flatMap((p) => p.clasesIds)), [periodos]);

  return (
    <AppShell title="Plan de estudio recomendado" backTo="/admin" backLabel="Panel">
      {error && <p className="page-error">{error}</p>}

      <section className="panel">
        <h2>Malla</h2>
        <div className="inline-form inline-form-end">
          <label className="field">
            Carrera
            <select value={carreraId} onChange={(e) => setCarreraId(e.target.value)}>
              <option value="">Selecciona una carrera</option>
              {carreras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.codigo})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Plantilla / versión
            <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)} disabled={!carreraId}>
              <option value="">Selecciona una plantilla</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} (v{p.version}) {p.activa ? '' : '— inactiva'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {plantillaId && (
        <>
          <section className="panel">
            <h2>Nuevo periodo</h2>
            <form className="inline-form inline-form-end" onSubmit={onCrearPeriodo}>
              <label className="field">
                Año
                <input
                  placeholder="p. ej. primer año"
                  value={nuevoAnnoLabel}
                  onChange={(e) => setNuevoAnnoLabel(e.target.value)}
                />
              </label>
              <label className="field">
                Periodo
                <input
                  placeholder="p. ej. primer periodo"
                  value={nuevoPeriodoLabel}
                  onChange={(e) => setNuevoPeriodoLabel(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-primary">
                Agregar periodo
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Periodos recomendados</h2>
            {loading ? (
              <p>Cargando…</p>
            ) : periodos.length === 0 ? (
              <p>Esta plantilla todavía no tiene periodos recomendados.</p>
            ) : (
              gruposPorAnno.map(([anno, items]) => (
                <div key={anno} className="plan-estudio-anno">
                  <h3 className="plan-estudio-anno-title">{anno}</h3>
                  {items.map((p) => (
                    <PlanEstudioPeriodoCard
                      key={p.id}
                      periodoItem={p}
                      clasesDisponibles={clasesDisponibles}
                      clasesUsadasIds={clasesUsadasIds}
                      onAgregarClase={onAgregarClase}
                      onQuitarClase={onQuitarClase}
                      onEliminarPeriodo={onEliminarPeriodo}
                      onEditarEtiqueta={onEditarEtiqueta}
                    />
                  ))}
                </div>
              ))
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
