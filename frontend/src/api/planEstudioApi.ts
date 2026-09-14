import type { PlanEstudioPeriodo } from '../planEstudio/types';
import { httpClient } from './httpClient';

export async function listPlanEstudio(plantillaId: string): Promise<PlanEstudioPeriodo[]> {
  const { data } = await httpClient.get<PlanEstudioPeriodo[]>('/plan-estudio', { params: { plantillaId } });
  return data;
}

export async function createPlanEstudioPeriodo(
  idPlantillaMalla: string,
  anno: string,
  periodo: string,
): Promise<PlanEstudioPeriodo> {
  const { data } = await httpClient.post<PlanEstudioPeriodo>('/plan-estudio', { idPlantillaMalla, anno, periodo });
  return data;
}

export async function updatePlanEstudioPeriodo(
  id: string,
  dto: { anno?: string; periodo?: string; clasesIds?: string[] },
): Promise<PlanEstudioPeriodo> {
  const { data } = await httpClient.patch<PlanEstudioPeriodo>(`/plan-estudio/${id}`, dto);
  return data;
}

export async function deletePlanEstudioPeriodo(id: string): Promise<void> {
  await httpClient.delete(`/plan-estudio/${id}`);
}
