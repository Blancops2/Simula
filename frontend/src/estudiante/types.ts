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
  periodoActual: boolean;
}

export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';

export type FallaPrediccion =
  | 'NO_CONFIGURADO'
  | 'CARRERA_NO_SOPORTADA'
  | 'SOLICITUD_INVALIDA'
  | 'RESPUESTA_INVALIDA'
  | 'TIEMPO_EXCEDIDO'
  | 'NO_DISPONIBLE';

// Falla de una simulación: las del modelo más ERROR_INTERNO (error de SIMULA
// a mitad de la evaluación; la simulación queda registrada con ese tipo).
export type FallaSimulacion = FallaPrediccion | 'ERROR_INTERNO';

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

// GET /estudiante/simulaciones: últimas simulaciones del período actual, en
// resumen (incluye las fallidas). El detalle está en SimulacionCarga.
export interface ResumenSimulacion {
  idSimulacion: string;
  estado: 'GENERADA' | 'EVALUADA' | 'NO_EVALUADA';
  fechaGeneracion: string | null;
  totalUnidadesValorativas: number;
  limiteUnidadesValorativas: number;
  clases: { codigo: string; nombre: string }[];
  disponible: boolean;
  falla: FallaSimulacion | null;
  origenModelo: 'mock' | 'modelo' | null;
  probabilidadAprobarTodo: number | null;
  riesgo: NivelRiesgo | null;
}

export interface SimulacionesPeriodoActual {
  // null si el administrador no marcó ningún período como actual.
  periodo: { id: string; anno: string; periodo: string } | null;
  simulaciones: ResumenSimulacion[];
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
  falla: FallaSimulacion | null;
  versionModelo: string | null;
  // HU-05-07: 'mock' = resultados ilustrativos (la vista lo avisa); null si
  // no hubo respuesta del motor.
  origenModelo: 'mock' | 'modelo' | null;
  fechaEvaluacion: string | null;
  probabilidadAprobarTodo: number | null;
  riesgo: NivelRiesgo | null;
  // probabilidadAprobacion/riesgo en null = clase sin resultado.
  clases: {
    id: string;
    codigo: string;
    nombre: string;
    unidadesValorativas: number;
    origen: 'PROPUESTA' | 'INSCRITA';
    probabilidadAprobacion: number | null;
    riesgo: NivelRiesgo | null;
    factores: string[];
  }[];
  observaciones: string[];
}

// GET /estudiante/simulaciones/validacion y cuerpo del 400 de POST
// /estudiante/simulaciones: qué falta antes de simular. BLOQUEANTE impide
// simular; ADVERTENCIA solo informa.
export interface ValidacionSimulacionItem {
  codigo: string;
  tipo: 'BLOQUEANTE' | 'ADVERTENCIA';
  mensaje: string;
  dondeCorregir: string;
}

export interface ValidacionSimulacion {
  puedeSimular: boolean;
  validaciones: ValidacionSimulacionItem[];
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
