/**
 * El período académico activo lo decide el Back-End a partir de la fecha del
 * servidor (nunca lo envía el cliente), para que un estudiante no pueda
 * inscribirse "en" un período arbitrario.
 */
export function periodoActual(referencia: Date = new Date()): string {
  const semestre = referencia.getMonth() < 6 ? 1 : 2;
  return `${referencia.getFullYear()}-${semestre}`;
}
