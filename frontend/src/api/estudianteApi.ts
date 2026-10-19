import type {
  HistorialItem,
  InscripcionItem,
  MallaConEstado,
  PensumArbol,
  PeriodoDisponible,
  PerfilEstudiante,
  PlanEstudioPeriodoConEstado,
  RecomendacionClases,
  RecomendacionPeriodo,
  ResultadoGuardadoHistorial,
  ResumenAcademico,
  SimulacionCarga,
  SimulacionesPeriodoActual,
  ValidacionSimulacion,
} from '../estudiante/types';
import type { ExtractionResult } from '../estudiante/extraccionPdf.types';
import { httpClient } from './httpClient';

export async function getPerfil(): Promise<PerfilEstudiante> {
  const { data } = await httpClient.get<PerfilEstudiante>('/estudiante/perfil');
  return data;
}

export async function getResumenAcademico(): Promise<ResumenAcademico> {
  const { data } = await httpClient.get<ResumenAcademico>('/estudiante/resumen-academico');
  return data;
}

export interface ActualizarPerfilInput {
  nombreCompleto?: string;
  codigoEstudiantil?: string;
}

export async function actualizarPerfil(input: ActualizarPerfilInput): Promise<void> {
  await httpClient.patch('/estudiante/perfil', input);
}

export async function getMalla(): Promise<MallaConEstado> {
  const { data } = await httpClient.get<MallaConEstado>('/estudiante/malla');
  return data;
}

export async function getPlanEstudio(): Promise<PlanEstudioPeriodoConEstado[]> {
  const { data } = await httpClient.get<PlanEstudioPeriodoConEstado[]>('/estudiante/plan-estudio');
  return data;
}

// `periodoId` opcional: si se indica, el modelo predictivo considera lo ya
// inscrito en ese período al recomendar.
export async function getRecomendacionClases(periodoId?: string): Promise<RecomendacionClases> {
  const { data } = await httpClient.get<RecomendacionClases>('/estudiante/recomendaciones/clases', {
    params: periodoId ? { periodoId } : undefined,
  });
  return data;
}

// HU-05-06: tope de espera de la simulación del lado del cliente, para que
// el estudiante no quede esperando si el backend no contesta. Holgado
// respecto al timeout del motor en el backend (PREDICTIVE_MODEL_TIMEOUT_MS,
// 3000 ms por defecto), que normalmente vence antes y responde
// TIEMPO_EXCEDIDO.
export const TIEMPO_MAXIMO_SIMULACION_MS = 20_000;

// HU-04-08: simula la carga inscrita en el período (el backend toma las
// inscripciones de la BD; no se mandan clases). Al vencer el tope, axios
// rechaza con código ETIMEDOUT (clarifyTimeoutError), distinto del
// ECONNABORTED de una petición cancelada.
export async function simularCarga(periodoId: string): Promise<SimulacionCarga> {
  const { data } = await httpClient.post<SimulacionCarga>(
    '/estudiante/simulaciones',
    { periodoId },
    { timeout: TIEMPO_MAXIMO_SIMULACION_MS, transitional: { clarifyTimeoutError: true } },
  );
  return data;
}

// Validaciones previas a simular (las mismas que aplica el POST de arriba).
export async function validarSimulacion(periodoId: string): Promise<ValidacionSimulacion> {
  const { data } = await httpClient.get<ValidacionSimulacion>('/estudiante/simulaciones/validacion', {
    params: { periodoId },
  });
  return data;
}

// Últimas simulaciones del estudiante en el período actual (las marca el
// administrador con periodoActual); 5 por defecto en el backend.
export async function getSimulacionesPeriodoActual(): Promise<SimulacionesPeriodoActual> {
  const { data } = await httpClient.get<SimulacionesPeriodoActual>('/estudiante/simulaciones');
  return data;
}

// Detalle completo de una simulación propia, con la misma forma que la
// respuesta de simularCarga.
export async function getSimulacion(idSimulacion: string): Promise<SimulacionCarga> {
  const { data } = await httpClient.get<SimulacionCarga>(`/estudiante/simulaciones/${encodeURIComponent(idSimulacion)}`);
  return data;
}

export async function getRecomendacionPeriodo(): Promise<RecomendacionPeriodo> {
  const { data } = await httpClient.get<RecomendacionPeriodo>('/estudiante/recomendaciones/periodo');
  return data;
}

export async function getPeriodosDisponibles(): Promise<PeriodoDisponible[]> {
  const { data } = await httpClient.get<PeriodoDisponible[]>('/estudiante/periodos');
  return data;
}

export async function getHistorial(): Promise<HistorialItem[]> {
  const { data } = await httpClient.get<HistorialItem[]>('/estudiante/historial');
  return data;
}

// Solo lectura: el backend extrae los datos del PDF y no guarda nada.
export async function extraerHistorialPdf(archivo: File, signal?: AbortSignal): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append('file', archivo);
  const { data } = await httpClient.post<ExtractionResult>('/estudiante/historial/extraer-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal,
  });
  return data;
}

// Vuelve a enviar el mismo PDF ya verificado: el backend lo extrae de nuevo
// y guarda (no se envían los datos extraídos desde el navegador).
export async function guardarHistorialPdf(archivo: File): Promise<ResultadoGuardadoHistorial> {
  const formData = new FormData();
  formData.append('file', archivo);
  const { data } = await httpClient.post<ResultadoGuardadoHistorial>('/estudiante/historial/guardar-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getInscripciones(): Promise<InscripcionItem[]> {
  const { data } = await httpClient.get<InscripcionItem[]>('/estudiante/inscripciones');
  return data;
}

export async function inscribirClases(periodoId: string, claseIds: string[]): Promise<InscripcionItem[]> {
  const { data } = await httpClient.post<InscripcionItem[]>('/estudiante/inscripciones', { periodoId, claseIds });
  return data;
}

export async function cancelarInscripcion(id: string): Promise<void> {
  await httpClient.delete(`/estudiante/inscripciones/${id}`);
}

export async function getPensum(): Promise<PensumArbol> {
  const { data } = await httpClient.get<PensumArbol>('/estudiante/pensum');
  return data;
}

export async function marcarClaseEnCurso(claseId: string): Promise<void> {
  await httpClient.post(`/estudiante/pensum/clases/${claseId}`);
}

export async function desmarcarClaseEnCurso(claseId: string): Promise<void> {
  await httpClient.delete(`/estudiante/pensum/clases/${claseId}`);
}
