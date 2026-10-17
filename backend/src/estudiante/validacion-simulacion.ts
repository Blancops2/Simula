// Validaciones previas a simular una carga (qué falta antes de simular). Las BLOQUEANTES
// impiden simular (el botón queda deshabilitado y POST /simulaciones
// responde 400); las ADVERTENCIAS solo orientan al estudiante.
export type TipoValidacion = 'BLOQUEANTE' | 'ADVERTENCIA';

export type CodigoValidacion =
  | 'PERIODO_NO_SELECCIONADO'
  | 'PERIODO_INEXISTENTE'
  | 'PERIODO_NO_VIGENTE'
  | 'SIN_ASIGNATURAS'
  | 'ASIGNATURA_DUPLICADA'
  | 'SIN_MALLA'
  | 'SIN_CARRERA'
  | 'SIN_PERIODO_CURSADO'
  | 'INDICE_ACADEMICO_BAJO';

export interface Validacion {
  codigo: CodigoValidacion;
  tipo: TipoValidacion;
  // Qué falta, con datos concretos (período, clase); nunca un texto genérico.
  mensaje: string;
  // Dónde se corrige, como texto (sin enlace: el estudiante ya está en la
  // página de inscripción cuando lo lee).
  dondeCorregir: string;
}

// Respuesta de GET /estudiante/simulaciones/validacion y cuerpo del 400 de
// POST /estudiante/simulaciones.
export interface ValidacionSimulacion {
  puedeSimular: boolean;
  validaciones: Validacion[];
}

export function bloqueante(codigo: CodigoValidacion, mensaje: string, dondeCorregir: string): Validacion {
  return { codigo, tipo: 'BLOQUEANTE', mensaje, dondeCorregir };
}

export function advertencia(codigo: CodigoValidacion, mensaje: string, dondeCorregir: string): Validacion {
  return { codigo, tipo: 'ADVERTENCIA', mensaje, dondeCorregir };
}

export function resultadoValidacion(validaciones: Validacion[]): ValidacionSimulacion {
  return { puedeSimular: !validaciones.some((v) => v.tipo === 'BLOQUEANTE'), validaciones };
}
