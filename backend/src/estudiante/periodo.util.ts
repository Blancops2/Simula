/**
 * El período académico activo lo decide el Back-End a partir de la fecha del
 * servidor (nunca lo envía el cliente), para que un estudiante no pueda
 * inscribirse "en" un período arbitrario.
 */
export function semestreActual(referencia: Date = new Date()): { anno: number; periodo: number } {
  const periodo = referencia.getMonth() < 6 ? 1 : 2;
  return { anno: referencia.getFullYear(), periodo };
}

/**
 * Forma en string "AAAA-P" de semestreActual(), usada donde el período se
 * sigue guardando como texto libre (p. ej. Inscripcion, ver HU-03-04).
 * HistorialAcademico ya NO usa esta forma: ahora referencia el catálogo
 * "periodo" por idperiodo (ver EstudianteService.resolverIdPeriodo).
 */
export function periodoActual(referencia: Date = new Date()): string {
  const { anno, periodo } = semestreActual(referencia);
  return `${anno}-${periodo}`;
}
