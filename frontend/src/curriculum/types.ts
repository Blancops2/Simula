export type TipoClase = 'OBLIGATORIA' | 'ELECTIVA';
export type TipoRequisito = 'PRERREQUISITO' | 'CORREQUISITO';

export interface Carrera {
  id: string;
  nombre: string;
  codigo: string;
}

export interface PlantillaResumen {
  id: string;
  nombre: string;
  version: number;
  activa: boolean;
  carreraId: string;
  plantillaOrigenId: string | null;
  carrera: { id: string; nombre: string; codigo: string };
  _count: { clases: number; estudiantes: number };
}

export interface RequisitoView {
  relacionId: string;
  claseId: string;
  codigo: string;
  nombre: string;
}

export interface ClaseView {
  id: string;
  codigo: string;
  nombre: string;
  unidadesValorativas: number;
  nivel: number;
  tipo: TipoClase;
  posX: number | null;
  posY: number | null;
  prerrequisitos: RequisitoView[];
  correquisitos: RequisitoView[];
}

export interface PlantillaArbol {
  id: string;
  nombre: string;
  version: number;
  activa: boolean;
  carreraId: string;
  plantillaOrigenId: string | null;
  niveles: { nivel: number; clases: ClaseView[] }[];
}

export interface EstudianteResumen {
  id: string;
  email: string;
}
