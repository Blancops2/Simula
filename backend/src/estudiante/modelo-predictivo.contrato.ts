// Tipos del contrato v1.2 con la API externa del modelo predictivo (HU-04-01).
// Fuente: docs/modelo-predictivo/03-decisiones-contrato.md (v1.0) más los
// cambios de docs/modelo-predictivo/05-recomendacion-carga.md (v1.1: la
// recomendación pasa a ser una carga completa con probabilidades) y v1.2
// (índice académico en estudiante.avance y estado NSP en el historial). Son
// interfaces TS a propósito (sin Zod): el backend no depende de Zod y la
// respuesta se valida a mano en ModeloPredictivoService.

export const VERSION_CONTRATO_MODELO = '1.2';

// ---------- Bloques comunes de la petición ----------

export interface CamposControlSolicitud {
  versionContrato: typeof VERSION_CONTRATO_MODELO;
  idSolicitud: string; // UUID generado por SIMULA, para trazar la petición en ambos lados
  fechaSolicitud: string; // ISO 8601, UTC
}

export interface EstudianteModelo {
  idEstudiante: string; // User.idUser, id opaco
  // D1: se mantiene en el contrato, pero SIMULA lo envía en null (minimización
  // de datos); el modelo ya recibe el historial completo en la petición.
  codigoEstudiantil: string | null;
  carrera: { id: string; codigo: string | null; nombre: string | null };
  malla: { id: string; nombre: string | null; version: number | null };
  nivelSugerido: number;
  avance: {
    unidadesValorativasAprobadas: number;
    unidadesValorativasAprobadasObligatorias: number;
    unidadesValorativasTotalesObligatorias: number;
    porcentajeMallaCompletada: number;
    // v1.2: Σ(nota × U.V.) / Σ(U.V.) de los intentos aprobados y reprobados;
    // null si todavía no hay ninguno con nota.
    indiceAcademico: number | null;
  };
}

// v1.2: NSP = no se presentó (intento sin nota).
export type EstadoHistorialModelo = 'APROBADA' | 'REPROBADA' | 'EN_CURSO' | 'NSP';
export type OrigenHistorialModelo = 'ADMIN' | 'AUTOREPORTE';

// Una entrada por intento (incluye reprobadas y repeticiones), ordenadas por
// período ascendente: los intentos fallidos son información útil para predecir.
export interface HistorialModelo {
  codigoClase: string;
  nombreClase: string | null;
  unidadesValorativas: number;
  nivel: number | null; // null si la clase ya no pertenece a la malla actual
  obligatoria: boolean | null;
  periodo: { anno: string; periodo: string };
  estado: EstadoHistorialModelo;
  nota: number | null; // escala 0–100; null para EN_CURSO, NSP o si no se registró
  origen: OrigenHistorialModelo;
}

export interface PeriodoCargaModelo {
  id: string;
  anno: string;
  periodo: string;
}

// ---------- POST {PREDICTIVE_MODEL_URL}/recomendaciones ----------

export interface CargaActualModelo {
  periodo: PeriodoCargaModelo;
  limiteUnidadesValorativas: number;
  clasesInscritas: string[]; // códigos ya en Inscripcion para ese período
  totalUnidadesValorativas: number;
}

// v1.1: clase que el modelo PUEDE incluir en la carga que recomienda. Lleva
// los datos que el modelo necesita para armar una carga válida (U.V. para el
// tope, requisitos) y si ya está inscrita en el período: la recomendación es
// una carga completa alternativa, así que puede conservar clases inscritas.
export interface ClaseCandidataModelo {
  codigoClase: string;
  nombreClase: string | null;
  unidadesValorativas: number;
  nivel: number;
  obligatoria: boolean;
  inscritaEnPeriodo: boolean;
  prerrequisitos: string[];
  correquisitos: string[];
}

export interface DatosRecomendaciones {
  estudiante: EstudianteModelo;
  historial: HistorialModelo[];
  cargaActual: CargaActualModelo | null; // null si no hay período seleccionado
  // Tope de U.V. de la carga recomendada COMPLETA (no de lo que queda libre).
  limiteUnidadesValorativas: number;
  // El modelo solo puede recomendar dentro de esta lista (reemplaza a la
  // lista de códigos `clasesDisponibles` de la v1.0).
  clasesCandidatas: ClaseCandidataModelo[];
}

export type SolicitudRecomendaciones = CamposControlSolicitud & DatosRecomendaciones;

// v1.1: misma estructura que la evaluación de carga, más el motivo de por
// qué se recomienda cada clase.
export interface ClaseRecomendadaModelo {
  codigoClase: string;
  probabilidadAprobacion: number; // 0..1
  factores: string[]; // explicaciones en español; [] si no hay
  motivo: string | null;
}

export interface RespuestaRecomendaciones {
  versionContrato: string;
  idSolicitud: string;
  versionModelo: string;
  // Probabilidad de aprobar TODA la carga recomendada, calculada por el
  // modelo de forma conjunta (D7). null solo si `clases` viene vacío.
  probabilidadAprobarTodo: number | null;
  clases: ClaseRecomendadaModelo[]; // la carga recomendada; sin códigos repetidos
  observaciones: string[];
}

// ---------- POST {PREDICTIVE_MODEL_URL}/evaluacion-carga ----------

export type OrigenClaseCarga = 'PROPUESTA' | 'INSCRITA';

export interface ClaseCargaModelo {
  codigoClase: string;
  nombreClase: string | null;
  unidadesValorativas: number;
  nivel: number;
  obligatoria: boolean;
  origen: OrigenClaseCarga;
  prerrequisitos: string[];
  correquisitos: string[];
}

export interface CargaAcademicaModelo {
  periodo: PeriodoCargaModelo;
  limiteUnidadesValorativas: number;
  clases: ClaseCargaModelo[]; // nunca vacío: con carga vacía SIMULA no llama al modelo
  totalUnidadesValorativas: number;
}

export interface DatosEvaluacionCarga {
  estudiante: EstudianteModelo;
  historial: HistorialModelo[];
  cargaAcademica: CargaAcademicaModelo;
}

export type SolicitudEvaluacionCarga = CamposControlSolicitud & DatosEvaluacionCarga;

// D5: el modelo devuelve solo probabilidades; el riesgo (BAJO/MEDIO/ALTO) lo
// calcula SIMULA, así que no forma parte de la respuesta.
export interface EvaluacionClaseModelo {
  codigoClase: string;
  probabilidadAprobacion: number; // 0..1
  factores: string[]; // explicaciones en español; [] si no hay
}

export interface RespuestaEvaluacionCarga {
  versionContrato: string;
  idSolicitud: string;
  versionModelo: string;
  // D7: calculada por el modelo de forma conjunta; SIMULA nunca la deriva
  // multiplicando las probabilidades por clase.
  probabilidadAprobarTodo: number; // 0..1
  clases: EvaluacionClaseModelo[]; // una entrada por cada clase de la carga
  observaciones: string[];
}

// ---------- Errores ----------

export type CodigoErrorModelo =
  | 'DATOS_INVALIDOS'
  | 'NO_AUTORIZADO'
  | 'CARRERA_NO_SOPORTADA'
  | 'LIMITE_EXCEDIDO'
  | 'ERROR_INTERNO'
  | 'NO_ENCONTRADO';

export interface CuerpoErrorModelo {
  idSolicitud: string | null;
  error: { codigo: CodigoErrorModelo; mensaje: string; campo?: string | null };
}
