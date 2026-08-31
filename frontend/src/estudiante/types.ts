import type { TipoClase } from '../curriculum/types';

export type EstadoClaseEstudiante = 'APROBADA' | 'EN_CURSO' | 'DISPONIBLE' | 'BLOQUEADA';
export type EstadoHistorial = 'APROBADA' | 'REPROBADA' | 'EN_CURSO';

export interface RequisitoRef {
  relacionId: string;
  claseId: string;
  codigo: string;
  nombre: string;
}

export interface ClaseConEstado {
  id: string;
  codigo: string;
  nombre: string;
  unidadesValorativas: number;
  nivel: number;
  tipo: TipoClase;
  posX: number | null;
  posY: number | null;
  prerrequisitos: RequisitoRef[];
  correquisitos: RequisitoRef[];
  estadoEstudiante: EstadoClaseEstudiante;
  prerrequisitosFaltantes: RequisitoRef[];
}

export interface MallaConEstado {
  plantilla: { id: string; nombre: string; version: number; activa: boolean; carreraId: string };
  niveles: { nivel: number; clases: ClaseConEstado[] }[];
}

export interface AvanceAcademico {
  unidadesValorativasAprobadas: number;
  unidadesValorativasTotalesObligatorias: number;
  unidadesValorativasAprobadasObligatorias: number;
  porcentajeMallaCompletada: number;
}

export interface PerfilEstudiante {
  id: string;
  email: string;
  nombreCompleto: string | null;
  codigoEstudiantil: string | null;
  carrera: { id: string; nombre: string; codigo: string } | null;
  plantilla: { id: string; nombre: string; version: number; activa: boolean } | null;
  semestreSugerido: number;
  avance: AvanceAcademico;
}

export interface HistorialItem {
  id: string;
  periodo: string;
  estado: EstadoHistorial;
  nota: number | null;
  clase: { codigo: string; nombre: string; unidadesValorativas: number; nivel: number };
}

export interface ClasePensum {
  id: string;
  codigo: string;
  nombre: string;
  unidadesValorativas: number;
  nivel: number;
  tipo: TipoClase;
  posX: number | null;
  posY: number | null;
  prerrequisitos: RequisitoRef[];
  correquisitos: RequisitoRef[];
  cursada: boolean;
  oficial: boolean;
  autorreportada: boolean;
}

export interface PensumArbol {
  plantilla: { id: string; nombre: string; version: number; activa: boolean; carreraId: string };
  niveles: { nivel: number; clases: ClasePensum[] }[];
}

export interface InscripcionItem {
  id: string;
  periodo: string;
  clase: {
    id: string;
    codigo: string;
    nombre: string;
    unidadesValorativas: number;
    nivel: number;
    tipo: TipoClase;
  };
}
