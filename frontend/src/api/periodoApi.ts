import type { EstadoPeriodo, Periodo } from '../periodo/types';
import { httpClient } from './httpClient';

export interface CreatePeriodoInput {
  anno: number;
  periodo: number;
  estado?: EstadoPeriodo;
  fechaInicio?: string;
  fechaFin?: string;
}

export interface UpdatePeriodoInput {
  anno?: number;
  periodo?: number;
  fechaInicio?: string;
  fechaFin?: string;
}

export async function listPeriodos(): Promise<Periodo[]> {
  const { data } = await httpClient.get<Periodo[]>('/periodos');
  return data;
}

export async function createPeriodo(dto: CreatePeriodoInput): Promise<Periodo> {
  const { data } = await httpClient.post<Periodo>('/periodos', dto);
  return data;
}

export async function updatePeriodo(id: string, dto: UpdatePeriodoInput): Promise<Periodo> {
  const { data } = await httpClient.patch<Periodo>(`/periodos/${id}`, dto);
  return data;
}

export async function cambiarEstadoPeriodo(id: string, estado: EstadoPeriodo): Promise<Periodo> {
  const { data } = await httpClient.patch<Periodo>(`/periodos/${id}/estado`, { estado });
  return data;
}
