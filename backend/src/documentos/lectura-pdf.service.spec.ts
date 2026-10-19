import { BadRequestException } from '@nestjs/common';
import * as unpdf from 'unpdf';
import { Fragmento, LecturaPdfService, reconstruirLineas } from './lectura-pdf.service';
import { construirPdf } from './testing/construir-pdf';

jest.mock('unpdf', () => {
  const real = jest.requireActual('unpdf');
  return { ...real, getResolvedPDFJS: jest.fn(real.getResolvedPDFJS) };
});

const frag = (text: string, x: number, y: number, width = text.length * 5, height = 10): Fragmento => ({
  text,
  x,
  y,
  width,
  height,
});

describe('reconstruirLineas', () => {
  it('ordena de arriba hacia abajo (y mayor primero) y de izquierda a derecha', () => {
    const lineas = reconstruirLineas([frag('abajo', 50, 100), frag('derecha', 300, 700), frag('izquierda', 50, 700)]);
    expect(lineas.map((l) => l.segments)).toEqual([['izquierda', 'derecha'], ['abajo']]);
    expect(lineas[0]).toMatchObject({ y: 700, x: 50 });
  });

  it('agrupa en la misma línea si la y difiere hasta la mitad del alto', () => {
    // alto 10 → tolerancia 5
    expect(reconstruirLineas([frag('a', 0, 500), frag('b', 20, 495)])).toHaveLength(1);
    expect(reconstruirLineas([frag('a', 0, 500), frag('b', 20, 494.5)])).toHaveLength(2);
  });

  it('usa una tolerancia mínima de 2 puntos con textos muy bajos', () => {
    // alto 2 → mitad 1, pero la tolerancia mínima es 2
    expect(reconstruirLineas([frag('a', 0, 500, 5, 2), frag('b', 20, 498, 5, 2)])).toHaveLength(1);
    expect(reconstruirLineas([frag('a', 0, 500, 5, 2), frag('b', 20, 497.9, 5, 2)])).toHaveLength(2);
  });

  it('abre un nuevo segmento cuando el hueco supera 1,5 × alto', () => {
    // alto 10 → umbral 15 pt
    const [junta] = reconstruirLineas([frag('Juan', 0, 500, 20), frag('Pérez', 35, 500)]);
    expect(junta.segments).toEqual(['Juan Pérez']);
    const [separada] = reconstruirLineas([frag('Cliente:', 0, 500, 40), frag('Juan Pérez', 55.1, 500)]);
    expect(separada).toMatchObject({ segments: ['Cliente:', 'Juan Pérez'], text: 'Cliente: Juan Pérez' });
  });

  it('usa un umbral mínimo de 8 puntos para separar columnas', () => {
    // alto 4 → 1,5 × alto = 6, pero el mínimo es 8
    expect(reconstruirLineas([frag('a', 0, 500, 5, 4), frag('b', 12, 500, 5, 4)])[0].segments).toEqual(['a b']);
    expect(reconstruirLineas([frag('a', 0, 500, 5, 4), frag('b', 13.1, 500, 5, 4)])[0].segments).toEqual(['a', 'b']);
  });

  it('pega sin espacio los fragmentos que se tocan (palabra partida por pdf.js)', () => {
    expect(reconstruirLineas([frag('Ca', 0, 500, 10), frag('lificación', 10, 500)])[0].text).toBe('Calificación');
  });

  it('ignora fragmentos vacíos', () => {
    expect(reconstruirLineas([frag(' ', 0, 500), frag('', 10, 400)])).toEqual([]);
  });
});

describe('LecturaPdfService', () => {
  const servicio = new LecturaPdfService();

  it('lee páginas, dimensiones, líneas y metadatos de un PDF digital', async () => {
    const pdf = construirPdf(
      [[{ x: 56, y: 700, texto: 'Carrera:' }, { x: 200, y: 700, texto: 'Ingeniería' }], [{ x: 56, y: 700, texto: 'Fin' }]],
      { titulo: 'Historial', autor: 'Registro' },
    );
    const doc = await servicio.leer(pdf);
    expect(doc.pageCount).toBe(2);
    expect(doc.metadata).toMatchObject({ Title: 'Historial', Author: 'Registro' });
    expect(doc.pages[0]).toMatchObject({ page: 1, width: 612, height: 792 });
    expect(doc.pages[0].lines).toEqual([
      {
        y: 700,
        x: 56,
        segments: ['Carrera:', 'Ingeniería'],
        segmentsX: [56, 200],
        segmentsEndX: [expect.any(Number), expect.any(Number)],
        text: 'Carrera: Ingeniería',
      },
    ]);
    // Cada segmento termina después de empezar y antes del siguiente.
    const [fin1, fin2] = doc.pages[0].lines[0].segmentsEndX;
    expect(fin1).toBeGreaterThan(56);
    expect(fin1).toBeLessThan(200);
    expect(fin2).toBeGreaterThan(200);
    expect(doc.pages[1].lines.map((l) => l.text)).toEqual(['Fin']);
  });

  it('devuelve páginas sin líneas cuando el PDF no tiene capa de texto', async () => {
    const doc = await servicio.leer(construirPdf([[]]));
    expect(doc.pages[0].lines).toEqual([]);
  });

  it('rechaza con 400 un PDF dañado', async () => {
    await expect(servicio.leer(Buffer.from('%PDF-1.4\nbasura sin estructura'))).rejects.toThrow(BadRequestException);
  });

  // Simula una tarea de carga de pdf.js que falla al abrir el documento.
  function tareaQueFalla(error: Error) {
    const destroy = jest.fn().mockResolvedValue(undefined);
    const getDocument = jest.fn(() => ({ promise: Promise.reject(error), destroy }));
    (unpdf.getResolvedPDFJS as jest.Mock).mockResolvedValueOnce({ getDocument });
    return destroy;
  }

  it('rechaza con 400 un PDF protegido con contraseña', async () => {
    const destroy = tareaQueFalla(Object.assign(new Error('No password given'), { name: 'PasswordException' }));
    await expect(servicio.leer(construirPdf([[]]))).rejects.toThrow(/contraseña/);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('libera la tarea de pdf.js también cuando el PDF no abre (no retiene el archivo)', async () => {
    const destroy = tareaQueFalla(Object.assign(new Error('Invalid PDF structure'), { name: 'InvalidPDFException' }));
    await expect(servicio.leer(Buffer.from('%PDF-1.4'))).rejects.toThrow(/dañado/);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
