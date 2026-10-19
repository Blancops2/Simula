// Período reservado para las clases del historial que no traen período: las
// equivalencias (clases cursadas en otra institución y acreditadas). Se
// identifica por el año "0000". Es un registro del sistema: no se lista al
// administrador ni se puede editar, habilitar o marcar como actual (ver
// PeriodoService). Se crea con el script de datos
// prisma/migrations/proposed/2026-10-19_periodo_sin_periodo.sql.
export const ANNO_SIN_PERIODO = '0000';

export function esPeriodoSinPeriodo(periodo: { anno: string | null } | null | undefined): boolean {
  return periodo?.anno === ANNO_SIN_PERIODO;
}
