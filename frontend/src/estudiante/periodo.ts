// El campo `periodo` en el historial académico convive en dos formatos:
// filas antiguas (o registradas por un administrador) lo guardan ya
// combinado como "AAAA-P" (ej. "2026-2"); el modal de autorreporte del
// estudiante lo guarda por separado como solo el dígito de período ("1",
// "2" o "3") junto con el año en su propio campo `anno`. Estas funciones
// normalizan entre ambos formatos para que la UI no dependa de cuál se usó.

const PERIODO_COMBINADO = /^(\d{4})-([1-3])$/;

export function formatPeriodo(periodo: string | null, anno: string | null): string {
  if (!periodo) return '—';
  if (PERIODO_COMBINADO.test(periodo)) return periodo;
  return anno ? `${anno}-${periodo}` : periodo;
}

export function parsePeriodoAnno(periodo: string | null, anno: string | null): { periodo: string; anno: string } {
  const combinado = periodo?.match(PERIODO_COMBINADO);
  if (combinado) return { periodo: combinado[2], anno: combinado[1] };
  return { periodo: periodo ?? '', anno: anno ?? '' };
}
