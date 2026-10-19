// Reglas puras (sin base de datos) para guardar el historial extraído del
// PDF: identificar la carrera, elegir la versión de malla e interpretar cada
// fila de la tabla. El servicio (guardar-historial-pdf.service.ts) solo las
// combina con las lecturas/escrituras de Prisma.

import { EstadoHistorial } from '../common/enums';
import { normalizarClave } from '../documentos/interpretacion.service';
import { TablaClases } from '../documentos/extraccion.types';

// Nota mínima de aprobación (escala 0-100), definida por el equipo.
export const NOTA_MINIMA_APROBACION = 65;

// "FF101" (PDF) y "FF-101" (BD) son la misma clase: se comparan en
// mayúsculas y solo con letras y números.
export function normalizarCodigo(codigo: string): string {
  return codigo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Nombre de carrera comparable: sin tildes, minúsculas, solo palabras.
export function normalizarNombreCarrera(nombre: string): string {
  return normalizarClave(nombre).replace(/_/g, ' ');
}

export interface CarreraCandidata {
  idCarrera: string;
  nombre: string | null;
}

export type ResultadoCarrera =
  | { tipo: 'encontrada'; carrera: CarreraCandidata }
  | { tipo: 'no_encontrada' }
  | { tipo: 'ambigua'; candidatas: CarreraCandidata[] };

// Solo por nombre (el PDF no trae código de carrera): primero coincidencia
// exacta (normalizada); si no hay, una que contenga a la otra. Más de una
// candidata es ambiguo: no se adivina.
export function buscarCarrera(carreras: CarreraCandidata[], nombrePdf: string): ResultadoCarrera {
  const buscado = normalizarNombreCarrera(nombrePdf);
  if (!buscado) return { tipo: 'no_encontrada' };
  const conNombre = carreras.filter((c) => c.nombre && normalizarNombreCarrera(c.nombre));

  const exactas = conNombre.filter((c) => normalizarNombreCarrera(c.nombre!) === buscado);
  if (exactas.length === 1) return { tipo: 'encontrada', carrera: exactas[0] };
  if (exactas.length > 1) return { tipo: 'ambigua', candidatas: exactas };

  const parciales = conNombre.filter((c) => {
    const nombre = normalizarNombreCarrera(c.nombre!);
    return nombre.includes(buscado) || buscado.includes(nombre);
  });
  if (parciales.length === 1) return { tipo: 'encontrada', carrera: parciales[0] };
  if (parciales.length > 1) return { tipo: 'ambigua', candidatas: parciales };
  return { tipo: 'no_encontrada' };
}

export interface MallaCandidata {
  idPlantillaMalla: string;
  nombre: string | null;
  version: number | null;
  activa: boolean;
  // Códigos normalizados de las clases de la malla.
  codigos: Set<string>;
}

export interface EleccionMalla {
  malla: MallaCandidata;
  coincidencias: number;
  // La otra candidata evaluada (versión anterior o activa), si la hubo.
  alternativa: { malla: MallaCandidata; coincidencias: number } | null;
}

// Gana la malla con más clases del historial; si empatan, la más reciente
// (mayor versión; a igual versión, la activa).
export function elegirMalla(candidatas: MallaCandidata[], codigosHistorial: Set<string>): EleccionMalla | null {
  if (candidatas.length === 0) return null;
  const evaluadas = candidatas.map((malla) => ({
    malla,
    coincidencias: [...codigosHistorial].filter((c) => malla.codigos.has(c)).length,
  }));
  evaluadas.sort(
    (a, b) =>
      b.coincidencias - a.coincidencias ||
      (b.malla.version ?? -Infinity) - (a.malla.version ?? -Infinity) ||
      Number(b.malla.activa) - Number(a.malla.activa),
  );
  const [ganadora, ...resto] = evaluadas;
  return { ...ganadora, alternativa: resto[0] ?? null };
}

// ---------- Columnas de la tabla ----------

const palabras = (columna: string) => normalizarClave(columna).split('_');
const tienePalabra = (columna: string, opciones: string[]) => palabras(columna).some((w) => opciones.includes(w));

const PALABRAS_CODIGO = ['cod', 'codigo'];
const PALABRAS_EQUIVALENTE = ['equivalente', 'equivalencia'];

export interface ColumnasHistorial {
  codigo: number;
  asignatura: number;
  anno: number;
  periodo: number;
  calificacion: number;
  seccion: number;
}

// Índice de cada columna según su encabezado (-1 si no está).
export function columnasDeHistorial(columns: string[]): ColumnasHistorial {
  const buscar = (opciones: string[], excluir: string[] = []) =>
    columns.findIndex((c) => tienePalabra(c, opciones) && !tienePalabra(c, excluir));
  return {
    codigo: buscar(PALABRAS_CODIGO, PALABRAS_EQUIVALENTE),
    asignatura: buscar(['asignatura', 'materia', 'clase'], [...PALABRAS_CODIGO, ...PALABRAS_EQUIVALENTE]),
    anno: buscar(['ano', 'anio', 'year']),
    periodo: buscar(['periodo', 'per']),
    calificacion: buscar(['calif', 'calificacion', 'nota']),
    seccion: buscar(['seccion', 'secc', 'sec']),
  };
}

// En equivalencias se usa el código EQUIVALENTE (el de esta universidad):
// la columna de código que dice "equivalente"; si la tabla no la distingue,
// la columna de código.
export function columnaCodigoEquivalencia(columns: string[]): number {
  const equivalente = columns.findIndex(
    (c) => tienePalabra(c, PALABRAS_CODIGO) && tienePalabra(c, PALABRAS_EQUIVALENTE),
  );
  return equivalente !== -1 ? equivalente : columns.findIndex((c) => tienePalabra(c, PALABRAS_CODIGO));
}

// Nombre de la asignatura equivalente (la de esta universidad), para
// informar las equivalencias que no se cargan.
export function columnaAsignaturaEquivalencia(columns: string[]): number {
  const equivalente = columns.findIndex(
    (c) => tienePalabra(c, ['asignatura', 'materia', 'clase']) && tienePalabra(c, PALABRAS_EQUIVALENTE),
  );
  return equivalente !== -1 ? equivalente : columnasDeHistorial(columns).asignatura;
}

export function codigosDeTabla(tabla: TablaClases | null, columna: number): string[] {
  if (!tabla || columna === -1) return [];
  return tabla.rows.map((f) => normalizarCodigo(f.cells[columna] ?? '')).filter((c) => c.length > 0);
}

// ---------- Filas del historial ----------

export type FilaInterpretada =
  | {
      valida: true;
      codigo: string;
      anno: string;
      periodo: string;
      estado: EstadoHistorial;
      nota: string | null;
      seccion: string | null;
    }
  | { valida: false; motivo: string };

// Período "2024-1" en una sola columna, o año y período por separado.
function leerPeriodo(cells: string[], col: ColumnasHistorial): { anno: string; periodo: string } | null {
  const periodo = (cells[col.periodo] ?? '').trim();
  const anno = (cells[col.anno] ?? '').trim();
  const junto = /^(\d{4})\s*-\s*(\d)$/.exec(periodo);
  if (junto) return { anno: junto[1], periodo: junto[2] };
  if (/^\d{4}$/.test(anno) && /^\d$/.test(periodo)) return { anno, periodo };
  return null;
}

// Estado desde la calificación (no desde OBS): ≥ 65 aprobada, < 65
// reprobada, "NSP" no se presentó (sin nota).
export function interpretarFilaHistorial(cells: string[], col: ColumnasHistorial): FilaInterpretada {
  const codigo = normalizarCodigo(cells[col.codigo] ?? '');
  if (!codigo) return { valida: false, motivo: 'Sin código de clase.' };

  const periodo = leerPeriodo(cells, col);
  if (!periodo) return { valida: false, motivo: 'Año o período ilegible.' };

  const calificacion = (cells[col.calificacion] ?? '').trim();
  let estado: EstadoHistorial;
  let nota: string | null;
  if (calificacion.toUpperCase() === EstadoHistorial.NSP) {
    estado = EstadoHistorial.NSP;
    nota = null;
  } else {
    const valor = /^\d{1,3}(?:[.,]\d+)?$/.test(calificacion) ? Number(calificacion.replace(',', '.')) : NaN;
    if (Number.isNaN(valor) || valor < 0 || valor > 100) {
      return { valida: false, motivo: `Calificación inválida ("${calificacion}").` };
    }
    estado = valor >= NOTA_MINIMA_APROBACION ? EstadoHistorial.APROBADA : EstadoHistorial.REPROBADA;
    nota = String(valor);
  }

  const seccion = col.seccion !== -1 ? (cells[col.seccion] ?? '').trim() || null : null;
  return { valida: true, codigo, ...periodo, estado, nota, seccion };
}
