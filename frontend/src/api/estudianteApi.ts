import type {
  HistorialItem,
  InscripcionItem,
  MallaConEstado,
  PensumArbol,
  PeriodoDisponible,
  PerfilEstudiante,
  PlanEstudioPeriodoConEstado,
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

export async function getPeriodosDisponibles(): Promise<PeriodoDisponible[]> {
  const { data } = await httpClient.get<PeriodoDisponible[]>('/estudiante/periodos');
  return data;
}

export async function getHistorial(): Promise<HistorialItem[]> {
  const { data } = await httpClient.get<HistorialItem[]>('/estudiante/historial');
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

export interface DetalleClaseCursada {
  periodo?: number;
  anno?: number;
  nota?: number;
}

export async function marcarClaseCursada(claseId: string, detalle?: DetalleClaseCursada): Promise<void> {
  await httpClient.post(`/estudiante/pensum/clases/${claseId}`, detalle);
}

export async function desmarcarClaseCursada(claseId: string): Promise<void> {
  await httpClient.delete(`/estudiante/pensum/clases/${claseId}`);
}
