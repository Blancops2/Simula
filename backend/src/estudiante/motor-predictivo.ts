import {
  CamposControlSolicitud,
  DatosEvaluacionCarga,
  DatosRecomendaciones,
  RespuestaEvaluacionCarga,
  RespuestaRecomendaciones,
} from './modelo-predictivo.contrato';

// Errores de dominio del motor; la implementación traduce a estos cualquier
// error técnico (HTTP, red, timeout, JSON malformado) para que nadie más
// tenga que conocerlos.
// NO_CONFIGURADO: no hay motor configurado (el llamador decide si hay
// fallback). CARRERA_NO_SOPORTADA: el motor no atiende esa carrera o malla,
// la UI puede dar un mensaje específico. SOLICITUD_INVALIDA: la solicitud
// armada por SIMULA no cumple el contrato y no se envió (HU-05-03).
// RESPUESTA_INVALIDA: el motor respondió, pero la respuesta no cumple el
// contrato (no es JSON, le faltan campos o no corresponde a la solicitud).
// TIEMPO_EXCEDIDO: el motor no respondió dentro de
// PREDICTIVE_MODEL_TIMEOUT_MS (HU-05-06: la UI lo distingue de una caída).
// NO_DISPONIBLE: el motor no se pudo contactar o respondió con un error.
export type FallaPrediccion =
  | 'NO_CONFIGURADO'
  | 'CARRERA_NO_SOPORTADA'
  | 'SOLICITUD_INVALIDA'
  | 'RESPUESTA_INVALIDA'
  | 'TIEMPO_EXCEDIDO'
  | 'NO_DISPONIBLE';

// Trazabilidad: quién produjo la respuesta. Se guarda en Simulacion.origenModelo.
export type OrigenModelo = 'mock' | 'modelo';

// `origen` es null cuando no hubo respuesta que leer: la solicitud no salió
// (NO_CONFIGURADO, SOLICITUD_INVALIDA), falló la red o se agotó el tiempo.
// `respuestaCruda`: el cuerpo tal cual llegó del motor (también si es un
// error o no cumple el contrato), para guardarlo en Simulacion.respuestaJson;
// null en los mismos casos que `origen`.
// `detalle`: precisión corta de la falla, la misma que va al log ("HTTP 503
// ERROR_INTERNO", "sin respuesta en 3000 ms", reglas del contrato que no se
// cumplen), sin datos del estudiante; se guarda en Simulacion.detalleFalla.
export type ResultadoModelo<T> =
  | { ok: true; respuesta: T; origen: OrigenModelo; respuestaCruda: string }
  | {
      ok: false;
      falla: FallaPrediccion;
      detalle: string | null;
      origen: OrigenModelo | null;
      respuestaCruda: string | null;
    };

// Simulacion.detalleFalla es VARCHAR(255).
export const LARGO_MAXIMO_DETALLE_FALLA = 255;

export function recortarDetalleFalla(detalle: string): string {
  return detalle.length <= LARGO_MAXIMO_DETALLE_FALLA ? detalle : `${detalle.slice(0, LARGO_MAXIMO_DETALLE_FALLA - 1)}…`;
}

// Puerto único hacia el motor predictivo. El resto de la aplicación depende
// solo de esta clase abstracta (que además sirve de token de inyección en
// Nest); la implementación concreta se elige en EstudianteModule. Las
// respuestas que entrega ya están validadas contra el contrato.
export abstract class MotorPredictivo {
  abstract estaConfigurado(): boolean;

  abstract recomendar(datos: DatosRecomendaciones): Promise<ResultadoModelo<RespuestaRecomendaciones>>;

  // `control` viene de la simulación persistida (tabla Simulacion), para que
  // el idSolicitud enviado al motor sea el mismo que quedó guardado.
  abstract evaluarCarga(
    datos: DatosEvaluacionCarga,
    control: CamposControlSolicitud,
  ): Promise<ResultadoModelo<RespuestaEvaluacionCarga>>;

  // v1.3 (HU-05-03): seudónimo estable de User.idUser que se envía como
  // idEstudiante; el motor nunca recibe el id real.
  abstract seudonimoEstudiante(idUser: string): string;
}
