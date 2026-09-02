import type {
  HistorialItem,
  InscripcionItem,
  MallaConEstado,
  PensumArbol,
  PerfilEstudiante,
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

export async function getHistorial(): Promise<HistorialItem[]> {
  const { data } = await httpClient.get<HistorialItem[]>('/estudiante/historial');
  return data;
}

export async function getInscripciones(): Promise<InscripcionItem[]> {
  const { data } = await httpClient.get<InscripcionItem[]>('/estudiante/inscripciones');
  return data;
}

export async function inscribirClases(claseIds: string[]): Promise<InscripcionItem[]> {
  const { data } = await httpClient.post<InscripcionItem[]>('/estudiante/inscripciones', { claseIds });
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
