// Contrato de la respuesta de POST /estudiante/historial/extraer-pdf.
// SINCRONIZAR: hay una copia en frontend/src/estudiante/extraccionPdf.types.ts
// (el proyecto no tiene un paquete de tipos compartidos); cualquier cambio
// aquí debe replicarse allá.

export type TipoDato = 'email' | 'fecha' | 'porcentaje' | 'moneda' | 'numero' | 'texto';

export type MotivoDescarte = 'numero_pagina' | 'encabezado_pie_repetido' | 'linea_vacia' | 'unida_con_guion';

// Una línea visual reconstruida a partir de los fragmentos de pdf.js.
// `segments` son las columnas detectadas dentro de la línea; `text` es la
// línea completa (segmentos unidos por un espacio).
export interface TextLine {
  y: number;
  x: number;
  segments: string[];
  text: string;
}

// Línea antes de limpiar: además guarda dónde empieza y termina cada
// segmento, para reconocer encabezados de tabla en varias líneas y ubicar
// en su columna las filas con celdas vacías.
export interface RawLine extends TextLine {
  segmentsX: number[];
  segmentsEndX: number[];
}

export interface RawPage {
  page: number;
  width: number;
  height: number;
  lines: RawLine[];
}

export interface CleanPage {
  page: number;
  lines: TextLine[];
}

export interface ExtractedField {
  key: string;
  keyNormalized: string;
  value: string;
  type: TipoDato;
  normalized: string | number;
  page: number;
}

export interface DetectedTable {
  page: number;
  columns: number;
  // La primera fila es el encabezado.
  rows: string[][];
}

export interface RemovedLine {
  page: number;
  text: string;
  reason: MotivoDescarte;
}

// ---- Reglas del historial académico (capa por tipo de documento) ----

export interface DatoEstudiante {
  // Etiqueta tal como aparece en el PDF (ej. "No. cuenta"); null si no se encontró.
  etiqueta: string | null;
  valor: string | null;
  page: number | null;
}

export interface FilaHistorial {
  page: number;
  cells: string[];
}

export interface TablaClases {
  columns: string[];
  rows: FilaHistorial[];
}

export interface HistorialExtraido {
  estudiante: {
    numeroCuenta: DatoEstudiante;
    nombre: DatoEstudiante;
    carrera: DatoEstudiante;
  };
  // Tabla del historial unida a través de todas las páginas: un solo
  // encabezado y todas las filas en orden. null si no se encontró.
  clases: TablaClases | null;
  // Clases cursadas en otra institución y acreditadas por equivalencia
  // (sección aparte del PDF). null si el PDF no tiene equivalencias; no es
  // un dato obligatorio, así que no cuenta como faltante.
  equivalencias: TablaClases | null;
  // Datos esperados que no aparecieron en el PDF.
  faltantes: string[];
}

export interface ExtractionResult {
  fileName: string;
  fileSize: number;
  pageCount: number;
  metadata: Record<string, unknown>;
  stats: {
    rawLines: number;
    cleanLines: number;
    removedLines: number;
    fields: number;
    tables: number;
    elapsedMs: number;
  };
  fields: ExtractedField[];
  tables: DetectedTable[];
  removed: RemovedLine[];
  cleanPages: CleanPage[];
  rawPages: RawPage[];
  cleanText: string;
  historial: HistorialExtraido;
}
