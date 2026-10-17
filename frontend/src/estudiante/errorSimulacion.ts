import axios from 'axios';
import { TIEMPO_MAXIMO_SIMULACION_MS } from '../api/estudianteApi';
import type { FallaSimulacion } from './types';

// HU-05-06: todo error al simular se presenta como uno de estos tipos.
// NO_SOPORTADA es aparte porque reintentar no cambia nada: el modelo no
// cubre la carrera del estudiante.
export type TipoErrorSimulacion = 'NO_DISPONIBLE' | 'TIEMPO_EXCEDIDO' | 'INESPERADO' | 'NO_SOPORTADA';

export interface ErrorSimulacion {
  tipo: TipoErrorSimulacion;
  titulo: string;
  mensaje: string;
  reintentable: boolean;
}

const TITULO: Record<TipoErrorSimulacion, string> = {
  NO_DISPONIBLE: 'Simulación no disponible',
  TIEMPO_EXCEDIDO: 'Tiempo de espera excedido',
  INESPERADO: 'Error inesperado',
  NO_SOPORTADA: 'Carrera no soportada',
};

function error(tipo: TipoErrorSimulacion, mensaje: string): ErrorSimulacion {
  return { tipo, titulo: TITULO[tipo], mensaje, reintentable: tipo !== 'NO_SOPORTADA' };
}

// Simulación que llegó al backend pero el modelo no la evaluó
// (`disponible: false`).
export function errorDeFalla(falla: FallaSimulacion): ErrorSimulacion {
  switch (falla) {
    case 'NO_DISPONIBLE':
      return error('NO_DISPONIBLE', 'El modelo predictivo no está disponible en este momento.');
    case 'NO_CONFIGURADO':
      return error('NO_DISPONIBLE', 'La simulación con el modelo predictivo todavía no está habilitada.');
    case 'TIEMPO_EXCEDIDO':
      return error('TIEMPO_EXCEDIDO', 'El modelo predictivo no respondió a tiempo.');
    case 'RESPUESTA_INVALIDA':
      return error('INESPERADO', 'El modelo predictivo respondió con datos que no se pudieron interpretar.');
    case 'SOLICITUD_INVALIDA':
      return error('INESPERADO', 'Los datos de tu carga no cumplen el formato que espera el modelo predictivo.');
    case 'CARRERA_NO_SOPORTADA':
      return error('NO_SOPORTADA', 'El modelo predictivo todavía no cubre tu carrera.');
    case 'ERROR_INTERNO':
      return error('INESPERADO', 'Ocurrió un error al procesar tu simulación.');
  }
}

// La petición misma falló. El 400 con `validaciones` no llega aquí: la
// página lo muestra en la lista de validaciones.
export function errorDeExcepcion(err: unknown): ErrorSimulacion {
  if (!axios.isAxiosError(err)) {
    return error('INESPERADO', 'Ocurrió un error inesperado al simular tu carga.');
  }
  if (err.code === 'ETIMEDOUT') {
    return error(
      'TIEMPO_EXCEDIDO',
      `El servidor no respondió en ${TIEMPO_MAXIMO_SIMULACION_MS / 1000} segundos y se dejó de esperar.`,
    );
  }
  const status = err.response?.status;
  if (!status) {
    return error('NO_DISPONIBLE', 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }
  if (status === 504) {
    return error('TIEMPO_EXCEDIDO', 'El servidor tardó demasiado en responder.');
  }
  if (status === 502 || status === 503) {
    return error('NO_DISPONIBLE', 'El servidor no está disponible en este momento.');
  }
  const mensaje = (err.response?.data as { message?: unknown } | undefined)?.message;
  return error(
    'INESPERADO',
    status < 500 && typeof mensaje === 'string' ? mensaje : 'Ocurrió un error inesperado al simular tu carga.',
  );
}
