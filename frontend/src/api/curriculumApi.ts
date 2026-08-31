import type {
  Carrera,
  ClaseView,
  EstudianteResumen,
  PlantillaArbol,
  PlantillaResumen,
  TipoClase,
  TipoRequisito,
} from '../curriculum/types';
import { httpClient } from './httpClient';

// Carreras

export async function listCarreras(): Promise<Carrera[]> {
  const { data } = await httpClient.get<Carrera[]>('/carreras');
  return data;
}

export async function createCarrera(nombre: string, codigo: string): Promise<Carrera> {
  const { data } = await httpClient.post<Carrera>('/carreras', { nombre, codigo });
  return data;
}

// Plantillas

export async function listPlantillas(carreraId?: string): Promise<PlantillaResumen[]> {
  const { data } = await httpClient.get<PlantillaResumen[]>('/plantillas', {
    params: carreraId ? { carreraId } : undefined,
  });
  return data;
}

export async function createPlantilla(carreraId: string, nombre: string): Promise<PlantillaResumen> {
  const { data } = await httpClient.post<PlantillaResumen>('/plantillas', { carreraId, nombre });
  return data;
}

export async function getPlantillaArbol(id: string): Promise<PlantillaArbol> {
  const { data } = await httpClient.get<PlantillaArbol>(`/plantillas/${id}`);
  return data;
}

export async function updatePlantilla(
  id: string,
  dto: { nombre?: string; activa?: boolean },
): Promise<PlantillaResumen> {
  const { data } = await httpClient.patch<PlantillaResumen>(`/plantillas/${id}`, dto);
  return data;
}

export async function deletePlantilla(id: string): Promise<void> {
  await httpClient.delete(`/plantillas/${id}`);
}

export async function duplicarPlantilla(id: string, nombre?: string): Promise<PlantillaArbol> {
  const { data } = await httpClient.post<PlantillaArbol>(`/plantillas/${id}/duplicar`, { nombre });
  return data;
}

export async function listEstudiantesDePlantilla(id: string): Promise<EstudianteResumen[]> {
  const { data } = await httpClient.get<EstudianteResumen[]>(`/plantillas/${id}/estudiantes`);
  return data;
}

// Clases

export interface ClaseInput {
  codigo: string;
  nombre: string;
  unidadesValorativas: number;
  nivel: number;
  tipo: TipoClase;
  posX?: number;
  posY?: number;
}

export async function addClase(plantillaId: string, dto: ClaseInput): Promise<ClaseView> {
  const { data } = await httpClient.post<ClaseView>(`/plantillas/${plantillaId}/clases`, dto);
  return data;
}

export async function updateClase(id: string, dto: Partial<ClaseInput>): Promise<ClaseView> {
  const { data } = await httpClient.patch<ClaseView>(`/clases/${id}`, dto);
  return data;
}

export async function deleteClase(id: string): Promise<void> {
  await httpClient.delete(`/clases/${id}`);
}

// Requisitos

export async function addRequisito(
  claseId: string,
  requisitoId: string,
  tipo: TipoRequisito,
): Promise<{ id: string; claseId: string; requisitoId: string; tipo: TipoRequisito }> {
  const { data } = await httpClient.post(`/clases/${claseId}/requisitos`, { requisitoId, tipo });
  return data;
}

export async function deleteRequisito(relacionId: string): Promise<void> {
  await httpClient.delete(`/requisitos/${relacionId}`);
}

// Estudiantes

export async function asignarPlantillaAEstudiante(userId: string, plantillaId: string): Promise<void> {
  await httpClient.patch(`/estudiantes/${userId}/plantilla`, { plantillaId });
}
