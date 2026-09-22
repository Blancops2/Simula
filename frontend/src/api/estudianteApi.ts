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
} from '../estudiante/types';
import { httpClient } from './httpClient';

export async function getPerfil(): Promise<PerfilEstudiante> {
  const { data } = await httpClient.get<PerfilEstudiante>('/estudiante/perfil');
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

export async function getRecomendacionClases(): Promise<RecomendacionClases> {
  const { data } = await httpClient.get<RecomendacionClases>('/estudiante/recomendaciones/clases');
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
