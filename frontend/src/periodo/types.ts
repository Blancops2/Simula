export type EstadoPeriodo = 'habilitado' | 'deshabilitado';

export interface Periodo {
  id: string;
  anno: string;
  periodo: string;
  estado: EstadoPeriodo;
  fechaInicio: string | null;
  fechaFin: string | null;
}
