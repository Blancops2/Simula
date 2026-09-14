/**
 * Semestre calendario a partir de la fecha del servidor. Ya NO se usa para
 * decidir en qué período se matricula un estudiante (HU-03-04: eso ahora lo
 * elige el propio estudiante vía periodoId, revalidado contra el catálogo en
 * EstudianteService.obtenerPeriodoHabilitadoOFallar); sigue sirviendo como
 * valor por defecto para el autorreporte de clases cursadas "hoy" cuando el
 * estudiante no especifica período/año (ver EstudianteService.resolverIdPeriodoActual).
 */
export function semestreActual(referencia: Date = new Date()): { anno: number; periodo: number } {
  const periodo = referencia.getMonth() < 6 ? 1 : 2;
  return { anno: referencia.getFullYear(), periodo };
}
