export type EstadoPeriodo = 'habilitado' | 'deshabilitado';

export interface Periodo {
  id: string;
  anno: string;
  periodo: string;
  estado: EstadoPeriodo;
  fechaInicio: string | null;
  fechaFin: string | null;
  // Período actual (solo uno); lo marca el administrador.
  periodoActual: boolean;
}
