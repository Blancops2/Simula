import { Injectable } from '@nestjs/common';
import { CleanPage, MotivoDescarte, RawPage, RemovedLine, TextLine } from './extraccion.types';

export interface ResultadoLimpieza {
  pages: CleanPage[];
  removed: RemovedLine[];
}

// Fracción superior e inferior de la página donde se buscan números de
// página y encabezados/pies repetidos. Fuera de esa franja nunca se quita nada.
const FRANJA_MARGEN = 0.12;

const NUMERO_PAGINA = [
  /^(p[aá]g(ina)?|page)\.?\s*\d+(\s*(de|of|\/)\s*\d+)?$/i, // Página 3, Pág. 3 de 10, Page 3 of 10
  /^\d+\s*(de|of|\/)\s*\d+$/i, // 3 / 10, 3 de 10
  /^[-–—]\s*\d+\s*[-–—]$/, // - 3 -
  /^\d+$/, // 3
];

export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(/[­​-‍⁠﻿]/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function esNumeroDePagina(texto: string): boolean {
  return NUMERO_PAGINA.some((re) => re.test(texto.trim()));
}

const conTexto = (segments: string[]): TextLine['segments'] => segments.filter((s) => s.length > 0);

function rehacerLinea(linea: TextLine, segments: string[]): TextLine {
  const limpios = conTexto(segments);
  return { ...linea, segments: limpios, text: limpios.join(' ') };
}

@Injectable()
export class LimpiezaTextoService {
  limpiar(rawPages: RawPage[]): ResultadoLimpieza {
    const removed: RemovedLine[] = [];
    const descartar = (page: number, text: string, reason: MotivoDescarte) => removed.push({ page, text, reason });

    // 1. Normalización de texto.
    const normalizadas = rawPages.map((p) => ({
      ...p,
      lines: p.lines.flatMap((linea) => {
        const nueva = rehacerLinea(linea, linea.segments.map(normalizarTexto));
        if (nueva.segments.length === 0) {
          descartar(p.page, linea.text, 'linea_vacia');
          return [];
        }
        return [nueva];
      }),
    }));

    // 2. Ruido en la franja de margen.
    const enMargen = (linea: TextLine, alto: number) =>
      linea.y >= alto * (1 - FRANJA_MARGEN) || linea.y <= alto * FRANJA_MARGEN;
    const firma = (texto: string) => texto.toLowerCase().replace(/\d/g, '#');

    // Encabezados/pies: misma firma en el margen de más de la mitad de las
    // páginas (solo con 2+ páginas). Se cuenta por página, no por aparición.
    const repetidas = new Set<string>();
    if (normalizadas.length >= 2) {
      const paginasPorFirma = new Map<string, Set<number>>();
      for (const p of normalizadas) {
        for (const linea of p.lines) {
          if (!enMargen(linea, p.height)) continue;
          const f = firma(linea.text);
          if (!paginasPorFirma.has(f)) paginasPorFirma.set(f, new Set());
          paginasPorFirma.get(f)!.add(p.page);
        }
      }
      for (const [f, paginas] of paginasPorFirma) {
        if (paginas.size > normalizadas.length / 2) repetidas.add(f);
      }
    }

    const sinRuido = normalizadas.map((p) => ({
      page: p.page,
      lines: p.lines.filter((linea) => {
        if (!enMargen(linea, p.height)) return true;
        if (esNumeroDePagina(linea.text)) {
          descartar(p.page, linea.text, 'numero_pagina');
          return false;
        }
        if (repetidas.has(firma(linea.text))) {
          descartar(p.page, linea.text, 'encabezado_pie_repetido');
          return false;
        }
        return true;
      }),
    }));

    // 3. Palabras cortadas con guion al final de línea, solo si la línea
    // siguiente empieza en minúscula. La primera palabra de la siguiente se
    // pega al final de la anterior.
    const pages: CleanPage[] = sinRuido.map((p) => {
      const lines: TextLine[] = [];
      for (const linea of p.lines) {
        const prev = lines[lines.length - 1];
        const ultimo = prev?.segments[prev.segments.length - 1] ?? '';
        if (prev && /\p{L}-$/u.test(ultimo) && /^\p{Ll}/u.test(linea.segments[0])) {
          const [primeraPalabra, ...resto] = linea.segments[0].split(' ');
          const prevSegs = [...prev.segments];
          prevSegs[prevSegs.length - 1] = ultimo.slice(0, -1) + primeraPalabra;
          lines[lines.length - 1] = rehacerLinea(prev, prevSegs);
          const restoLinea = rehacerLinea(linea, [resto.join(' '), ...linea.segments.slice(1)]);
          if (restoLinea.segments.length > 0) {
            lines.push(restoLinea);
          } else {
            descartar(p.page, linea.text, 'unida_con_guion');
          }
          continue;
        }
        lines.push(linea);
      }
      return { page: p.page, lines };
    });

    return { pages, removed };
  }
}
