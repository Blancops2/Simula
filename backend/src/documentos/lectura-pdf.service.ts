import { BadRequestException, Injectable } from '@nestjs/common';
import { extractTextItems, getMeta, getResolvedPDFJS } from 'unpdf';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'unpdf/pdfjs';
import { RawPage, TextLine } from './extraccion.types';

// Fragmento suelto tal como lo entrega pdf.js: coordenadas PDF, con y = 0
// en el borde INFERIOR de la página.
export interface Fragmento {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentoLeido {
  pageCount: number;
  metadata: Record<string, unknown>;
  pages: RawPage[];
}

// Alto por defecto cuando pdf.js reporta 0 (pasa con algunas fuentes).
const ALTO_POR_DEFECTO = 10;
// Fragmentos prácticamente pegados (pdf.js parte una palabra por kerning):
// se concatenan sin espacio para no romper la palabra.
const FACTOR_FRAGMENTOS_PEGADOS = 0.1;

const redondear = (n: number) => Math.round(n * 10) / 10;
const altoDe = (f: Fragmento) => (f.height > 0 ? f.height : ALTO_POR_DEFECTO);

// Reconstruye las líneas visuales de UNA página:
// 1. orden de arriba hacia abajo (y mayor primero) y de izquierda a derecha;
// 2. misma línea si la y difiere menos de la mitad del alto (mín. 2 pt);
// 3. nuevo segmento (columna) si el hueco horizontal supera 1,5 × alto
//    (mín. 8 pt); si no, se separa con un espacio entre palabras.
export function reconstruirLineas(fragmentos: Fragmento[]): TextLine[] {
  const ordenados = fragmentos
    .filter((f) => f.text.trim().length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const grupos: Fragmento[][] = [];
  for (const f of ordenados) {
    const actual = grupos[grupos.length - 1];
    if (actual) {
      const ref = actual[0];
      const tolerancia = Math.max(Math.max(altoDe(ref), altoDe(f)) / 2, 2);
      if (Math.abs(ref.y - f.y) <= tolerancia) {
        actual.push(f);
        continue;
      }
    }
    grupos.push([f]);
  }

  return grupos.map((grupo) => {
    // Dentro de la línea, una y apenas distinta pudo alterar el orden.
    grupo.sort((a, b) => a.x - b.x);
    const segments: string[] = [];
    let segmento = grupo[0].text;
    for (let i = 1; i < grupo.length; i++) {
      const prev = grupo[i - 1];
      const f = grupo[i];
      const alto = Math.max(altoDe(prev), altoDe(f));
      const hueco = f.x - (prev.x + prev.width);
      if (hueco > Math.max(1.5 * alto, 8)) {
        segments.push(segmento);
        segmento = f.text;
      } else if (hueco <= alto * FACTOR_FRAGMENTOS_PEGADOS) {
        segmento += f.text;
      } else {
        segmento += ' ' + f.text;
      }
    }
    segments.push(segmento);
    const limpios = segments.map((s) => s.trim()).filter((s) => s.length > 0);
    return {
      y: redondear(grupo[0].y),
      x: redondear(grupo[0].x),
      segments: limpios,
      text: limpios.join(' '),
    };
  });
}

// Solo valores primitivos: el diccionario Info de pdf.js puede traer
// objetos internos que no tienen sentido en la respuesta JSON.
function metadatosSerializables(info: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(info ?? {})) {
    if (valor instanceof Date) salida[clave] = valor.toISOString();
    else if (['string', 'number', 'boolean'].includes(typeof valor)) salida[clave] = valor;
  }
  return salida;
}

@Injectable()
export class LecturaPdfService {
  async leer(buffer: Buffer): Promise<DocumentoLeido> {
    // Se maneja la tarea de carga de pdf.js directamente (en vez de
    // getDocumentProxy) para poder destruirla SIEMPRE, también cuando el PDF
    // no abre: getDocumentProxy no la libera en ese caso y pdf.js se quedaba
    // con la copia del último PDF fallido en memoria.
    // pdf.js transfiere (deja inutilizable) el arreglo que recibe: se le
    // pasa una copia para no tocar el buffer de Multer.
    const { getDocument } = await getResolvedPDFJS();
    const tarea = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });
    try {
      return await this.leerDocumento(tarea);
    } finally {
      await tarea.destroy();
    }
  }

  private async leerDocumento(tarea: PDFDocumentLoadingTask): Promise<DocumentoLeido> {
    let pdf: PDFDocumentProxy;
    try {
      pdf = await tarea.promise;
    } catch (err) {
      if ((err as { name?: string })?.name === 'PasswordException') {
        throw new BadRequestException('El PDF está protegido con contraseña. Sube una versión sin protección.');
      }
      throw new BadRequestException('El PDF está dañado o no se pudo leer.');
    }

    try {
      const [{ items }, meta] = await Promise.all([
        extractTextItems(pdf),
        getMeta(pdf, { parseDates: true }).catch(() => ({ info: {} as Record<string, unknown> })),
      ]);

      const pages: RawPage[] = [];
      for (let i = 0; i < pdf.numPages; i++) {
        const viewport = (await pdf.getPage(i + 1)).getViewport({ scale: 1 });
        const fragmentos: Fragmento[] = (items[i] ?? []).map((it) => ({
          text: it.str,
          x: it.x,
          y: it.y,
          width: it.width,
          height: it.height,
        }));
        pages.push({
          page: i + 1,
          width: redondear(viewport.width),
          height: redondear(viewport.height),
          lines: reconstruirLineas(fragmentos),
        });
      }

      return { pageCount: pdf.numPages, metadata: metadatosSerializables(meta.info), pages };
    } catch {
      throw new BadRequestException('El PDF está dañado o no se pudo leer.');
    }
  }
}
