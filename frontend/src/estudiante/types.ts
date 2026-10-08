import type { TipoClase } from '../curriculum/types';
import type { EstadoPeriodo } from '../periodo/types';

export type EstadoClaseEstudiante = 'APROBADA' | 'EN_CURSO' | 'DISPONIBLE' | 'BLOQUEADA';
export type EstadoHistorial = 'APROBADA' | 'REPROBADA' | 'EN_CURSO' | 'NSP';

export interface ResumenAcademico {
  carrera: { id: string; nombre: string | null; codigo: string | null } | null;
  unidadesValorativasAprobadas: number;
  indiceAcademico: number | null;
  clasesConsideradas: number;
}

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

export interface PlanEstudioPeriodoConEstado {
  id: string;
  anno: string;
  periodo: string;
  clases: ClaseConEstado[];
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
  anno: string | null;
  estado: EstadoHistorial;
  nota: number | null;
  clase: { codigo: string; nombre: string; unidadesValorativas: number; nivel: number };
}

export interface ResultadoImportacionHistorial {
  totalFilas: number;
  registrados: number;
  omitidos: number;
  errores: string[];
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
  enCurso: boolean;
  oficial: boolean;
  autorreportada: boolean;
  periodo: string | null;
  anno: string | null;
  nota: string | null;
}

export interface PensumArbol {
  plantilla: { id: string; nombre: string; version: number; activa: boolean; carreraId: string };
  niveles: { nivel: number; clases: ClasePensum[] }[];
}

export interface PeriodoDisponible {
  id: string;
  anno: string;
  periodo: string;
  estado: EstadoPeriodo;
}

export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';

export type FallaPrediccion = 'NO_CONFIGURADO' | 'CARRERA_NO_SOPORTADA' | 'NO_DISPONIBLE';

// Clase de la carga recomendada; probabilidad/riesgo en null (y factores
// vacíos) cuando la recomendación viene del fallback local.
export interface ClaseRecomendada extends ClaseConEstado {
  inscritaEnPeriodo: boolean;
  probabilidadAprobacion: number | null;
  riesgo: NivelRiesgo | null;
  factores: string[];
  motivo: string | null;
}

// GET /estudiante/recomendaciones/clases (contrato v1.1): carga completa
// propuesta por el modelo para el período, con la misma estructura que una
// simulación. Solo informativa: no inscribe ni cancela nada.
export interface RecomendacionClases {
  disponible: boolean;
  fuente: 'MODELO_EXTERNO' | 'FALLBACK_LOCAL' | null;
  falla: FallaPrediccion | null;
  periodo: { id: string; anno: string; periodo: string } | null;
  versionModelo: string | null;
  probabilidadAprobarTodo: number | null;
  riesgo: NivelRiesgo | null;
  limiteUnidadesValorativas: number;
  totalUnidadesValorativas: number;
  clases: ClaseRecomendada[];
  observaciones: string[];
}

// POST /estudiante/simulaciones y GET /estudiante/simulaciones/:id (HU-04-08):
// simulación de la carga INSCRITA en un período. Primero la estructura de
// entrada persistida (siempre presente); después el resultado del modelo.
// Probabilidades en 0..1 calculadas por el modelo predictivo; el riesgo lo
// calcula el backend de SIMULA.
export interface SimulacionCarga {
  idSimulacion: string;
  estado: 'GENERADA' | 'EVALUADA' | 'NO_EVALUADA';
  idEstudiante: string;
  periodo: { id: string; anno: string; periodo: string; estado: string | null };
  limiteUnidadesValorativas: number;
  totalUnidadesValorativas: number;
  fechaGeneracion: string | null;
  carga: {
    id: string;
    codigo: string;
    nombre: string;
    unidadesValorativas: number;
    origen: 'PROPUESTA' | 'INSCRITA';
  }[];
  disponible: boolean;
  falla: FallaPrediccion | null;
  versionModelo: string | null;
  probabilidadAprobarTodo: number | null;
  riesgo: NivelRiesgo | null;
  clases: {
    id: string;
    codigo: string;
    nombre: string;
    unidadesValorativas: number;
    origen: 'PROPUESTA' | 'INSCRITA';
    probabilidadAprobacion: number;
    riesgo: NivelRiesgo;
    factores: string[];
  }[];
  observaciones: string[];
}

export interface RecomendacionPeriodo {
  periodo: PlanEstudioPeriodoConEstado | null;
  completado: boolean;
}

export interface InscripcionItem {
  id: string;
  periodoId: string;
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
