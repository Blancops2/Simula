import type { HistorialItem } from './types';

const ETIQUETAS_ESTADO: Record<NonNullable<HistorialItem['estado']>, string> = {
  APROBADA: 'Aprobada',
  REPROBADA: 'Reprobada',
  EN_CURSO: 'En curso',
  NSP: 'No se presentó',
};

// Etiqueta y clase CSS del estado de un registro del historial. Las
// equivalencias (clases acreditadas de otra institución) están aprobadas,
// pero sin nota ni período: se distinguen como "Aprobada por equivalencia".
export function estadoHistorial(h: Pick<HistorialItem, 'estado' | 'origen'>): { etiqueta: string; clase: string } {
  if (h.origen === 'EQUIVALENCIA') return { etiqueta: 'Aprobada por equivalencia', clase: 'status-aprobada' };
  if (!h.estado) return { etiqueta: 'Sin estado', clase: 'badge-neutral' };
  return { etiqueta: ETIQUETAS_ESTADO[h.estado], clase: `status-${h.estado.toLowerCase()}` };
}
