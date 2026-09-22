// El campo `periodo` en el historial académico convive en dos formatos:
// filas nuevas (CSV, administrador) lo guardan ya combinado como "AAAA-P"
// (ej. "2026-2"); filas heredadas de un formato anterior podían traer solo
// el dígito de período junto con el año en su propio campo `anno`. Esta
// función normaliza entre ambos formatos para que la UI no dependa de cuál
// se usó.

const PERIODO_COMBINADO = /^(\d{4})-([1-3])$/;

export function formatPeriodo(periodo: string | null, anno: string | null): string {
  if (!periodo) return '—';
  if (PERIODO_COMBINADO.test(periodo)) return periodo;
  return anno ? `${anno}-${periodo}` : periodo;
}
