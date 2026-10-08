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
  ResultadoImportacionHistorial,
  ResumenAcademico,
  SimulacionCarga,
} from '../estudiante/types';
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

// HU-04-08: simula la carga inscrita en el período (el backend toma las
// inscripciones de la BD; no se mandan clases).
export async function simularCarga(periodoId: string): Promise<SimulacionCarga> {
  const { data } = await httpClient.post<SimulacionCarga>('/estudiante/simulaciones', { periodoId });
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

export async function importarHistorial(archivo: File): Promise<ResultadoImportacionHistorial> {
  const formData = new FormData();
  formData.append('archivo', archivo);
  const { data } = await httpClient.post<ResultadoImportacionHistorial>('/estudiante/historial/importar', formData, {
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
