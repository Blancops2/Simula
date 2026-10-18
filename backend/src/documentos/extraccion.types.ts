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

export interface RawPage {
  page: number;
  width: number;
  height: number;
  lines: TextLine[];
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
}
