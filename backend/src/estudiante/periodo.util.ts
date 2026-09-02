/**
 * El período académico activo lo decide el Back-End a partir de la fecha del
 * servidor (nunca lo envía el cliente), para que un estudiante no pueda
 * inscribirse "en" un período arbitrario.
 */
export function periodoActual(referencia: Date = new Date()): string {
  const semestre = referencia.getMonth() < 6 ? 1 : 2;
  return `${referencia.getFullYear()}-${semestre}`;
}

/**
 * El selector de período (1/2/3) del modal de autorreporte es solo una
 * forma visual de capturar el dato: en la base de datos siempre se guarda
 * combinado con el año en formato "AAAA-P", igual que los registros de
 * administrador.
 */
export function periodoCombinado(periodo: number, anno: number): string {
  return `${anno}-${periodo}`;
}
