import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as passport from 'passport';
import { Role } from '../common/enums';
import { DocumentosModule } from './documentos.module';
import { ExtractionResult } from './extraccion.types';
import { TAMANO_MAXIMO_PDF } from './extraccion-pdf.controller';
import {
  COLUMNAS_EQUIVALENCIAS,
  COLUMNAS_EQUIVALENCIAS_UNAH,
  COLUMNAS_HISTORIAL,
  construirPdf,
  equivalenciasConTituloAlPie,
  equivalenciasConTituloPartidoYCeldasVacias,
  equivalenciasEstiloUnah,
  historialConEquivalencias,
  historialDeMuestra,
  historialMultipagina,
} from './testing/construir-pdf';

// Prueba HTTP real (Multer incluido) sin depender de JWT: se reemplaza la
// estrategia "jwt" de passport por una que autentica a un estudiante fijo.
class EstudianteFalso extends passport.Strategy {
  name = 'jwt';
  authenticate() {
    this.success({ userId: 'estudiante-1', role: Role.ESTUDIANTE });
  }
}

@Module({ imports: [DocumentosModule] })
class AppDePrueba {}

describe('POST /estudiante/historial/extraer-pdf', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    passport.use(new EstudianteFalso());
    app = await NestFactory.create(AppDePrueba, { logger: false });
    await app.listen(0);
    url = `${await app.getUrl()}/estudiante/historial/extraer-pdf`;
  });

  afterAll(async () => {
    await app.close();
  });

  const enviar = (contenido?: Buffer, nombre = 'historial.pdf') => {
    const form = new FormData();
    if (contenido) form.append('file', new Blob([new Uint8Array(contenido)], { type: 'application/pdf' }), nombre);
    return fetch(url, { method: 'POST', body: form });
  };

  it('200: devuelve el ExtractionResult completo de un PDF digital', async () => {
    const res = await enviar(historialDeMuestra(), 'historial-ñandú.pdf');
    expect(res.status).toBe(200);
    const r = (await res.json()) as ExtractionResult;

    expect(r).toMatchObject({ fileName: 'historial-ñandú.pdf', pageCount: 2 });
    expect(r.stats).toMatchObject({ removedLines: 4, tables: 1, fields: r.fields.length });
    expect(r.stats.cleanLines).toBe(r.cleanPages.reduce((n, p) => n + p.lines.length, 0));

    const campo = (k: string) => r.fields.find((f) => f.keyNormalized === k);
    expect(campo('nombre')).toMatchObject({ value: 'Ana María López', type: 'texto', page: 1 });
    expect(campo('carrera')).toMatchObject({ value: 'Ingeniería en Sistemas' });
    expect(campo('correo')).toMatchObject({ type: 'email', normalized: 'ana.lopez@correo.com' });
    expect(campo('fecha_de_expedicion')).toMatchObject({ type: 'fecha', normalized: '2026-03-05' });
    expect(campo('indice_academico')).toMatchObject({ type: 'porcentaje', normalized: 84.5 });
    expect(campo('observaciones')).toMatchObject({ value: 'el estudiante cursó la información', page: 2 });
    expect(campo('total_de_u_v')).toMatchObject({ type: 'numero', normalized: 1500 });
    expect(r.fields.some((f) => /https/i.test(f.key))).toBe(false);

    expect(r.tables[0]).toMatchObject({ page: 1, columns: 4 });
    expect(r.tables[0].rows[0]).toEqual(['Código', 'Asignatura', 'Período', 'Nota']);
    expect(r.tables[0].rows).toHaveLength(3);

    expect(r.removed.map((x) => x.reason).sort()).toEqual([
      'encabezado_pie_repetido',
      'encabezado_pie_repetido',
      'numero_pagina',
      'numero_pagina',
    ]);
    expect(r.cleanText).not.toMatch(/Página \d de 2/);
    expect(r.rawPages[0].lines[0]).toMatchObject({ y: 760, x: 56 });

    expect(r.historial.estudiante.nombre.valor).toBe('Ana María López');
    expect(r.historial.estudiante.carrera.valor).toBe('Ingeniería en Sistemas');
    expect(r.historial.faltantes).toEqual(['Número de cuenta']);
    expect(r.historial.clases?.rows).toHaveLength(2);
  });

  it('200: une el historial de varias páginas en una sola tabla sin perder filas', async () => {
    const res = await enviar(historialMultipagina());
    expect(res.status).toBe(200);
    const { historial, stats } = (await res.json()) as ExtractionResult;

    expect(historial.estudiante).toEqual({
      numeroCuenta: { etiqueta: 'No. cuenta', valor: '0020240099', page: 1 },
      nombre: { etiqueta: 'Nombre', valor: 'Daniela Sofía Ramírez Ortega', page: 1 },
      carrera: { etiqueta: 'Carrera', valor: 'Ingeniería de Sistemas', page: 1 },
    });
    expect(historial.faltantes).toEqual([]);
    // La detección genérica ve varias tablas; el historial es una sola.
    expect(stats.tables).toBeGreaterThan(1);
    expect(historial.clases?.columns).toEqual(COLUMNAS_HISTORIAL);
    const rows = historial.clases!.rows;
    // 20 + 30 + 1 filas; incluye las que caen en el margen superior de las
    // páginas 2 y 3, que la limpieza genérica descarta como "repetidas".
    expect(rows).toHaveLength(51);
    expect(rows.map((f) => f.cells[0])).toEqual(Array.from({ length: 51 }, (_, i) => `MAT-${101 + i}`));
    expect(rows.filter((f) => f.page === 3)).toHaveLength(1);
    // UV/CA (unidades valorativas) se conserva en su posición, después de Asignatura.
    expect(rows[0].cells.slice(1, 3)).toEqual(['Asignatura 1', '4']);
  });

  it('200: separa las equivalencias del historial, cada una unida entre páginas', async () => {
    const res = await enviar(historialConEquivalencias());
    expect(res.status).toBe(200);
    const { historial } = (await res.json()) as ExtractionResult;

    expect(historial.clases?.columns).toEqual(COLUMNAS_HISTORIAL);
    expect(historial.clases?.rows.map((f) => f.cells[0])).toEqual(Array.from({ length: 20 }, (_, i) => `MAT-${101 + i}`));
    expect(historial.equivalencias).toEqual({
      columns: COLUMNAS_EQUIVALENCIAS,
      rows: [1, 2, 3].map((n) => ({
        page: n === 3 ? 3 : 2,
        cells: [`EQ-${n}`, `Equivalente ${n}`, 'Universidad Anterior', `Curso origen ${n}`, '80'],
      })),
    });
    expect(historial.faltantes).toEqual([]);
  });

  it('200: título "Equivalencias" al pie de la página y su tabla (mismas columnas) en la siguiente', async () => {
    const { historial } = (await (await enviar(equivalenciasConTituloAlPie())).json()) as ExtractionResult;
    expect(historial.clases?.rows.map((f) => f.cells[0])).toEqual(['MAT-101', 'ESP-101']);
    expect(historial.equivalencias?.columns).toEqual(COLUMNAS_HISTORIAL);
    expect(historial.equivalencias?.rows.map((f) => [f.page, f.cells[0]])).toEqual([
      [2, 'SOC-101'],
      [2, 'ING-101'],
    ]);
  });

  it('200: título de equivalencias partido por espacios de más y filas con celdas vacías', async () => {
    const { historial } = (await (await enviar(equivalenciasConTituloPartidoYCeldasVacias())).json()) as ExtractionResult;
    expect(historial.clases?.rows.map((f) => f.cells[0])).toEqual(['MAT-101']);
    expect(historial.equivalencias?.rows.map((f) => f.cells)).toEqual([
      ['EQ-101', 'Contabilidad', '4', '', '', '', '80', 'EQV'],
      ['EQ-102', 'Economía', '3', '0100', '2023', '2', '75', 'EQV'],
    ]);
  });

  it('200: estructura del historial real (encabezado de equivalencias en dos líneas, título al pie)', async () => {
    const { historial } = (await (await enviar(equivalenciasEstiloUnah())).json()) as ExtractionResult;
    expect(historial.clases?.rows.map((f) => f.cells[0])).toEqual(['MM110', 'MM111']);
    expect(historial.equivalencias?.columns).toEqual(COLUMNAS_EQUIVALENCIAS_UNAH);
    expect(historial.equivalencias?.rows.map((f) => f.cells)).toEqual([
      ['EE101', 'ESPAÑOL', 'EG011', 'ESPANOL GENERAL'],
      ['SC101', 'SOCIOLOGIA', 'SC101', 'SOCIOLOGIA'],
      ['HH101', 'HISTORIA DE HONDURAS', 'HH101', 'HISTORIA DE HONDURAS'],
      ['FF101', 'FILOSOFIA', 'FF101', 'FILOSOFIA I'],
      ['IN101', 'INGLES I', 'IN101', 'INGLES I'],
    ]);
  });

  it('200: sin equivalencias en el PDF, `equivalencias` es null', async () => {
    const { historial } = (await (await enviar(historialMultipagina())).json()) as ExtractionResult;
    expect(historial.equivalencias).toBeNull();
  });

  it('400: sin archivo', async () => {
    const res = await enviar();
    expect(res.status).toBe(400);
  });

  it('400: archivo con extensión .pdf que no es un PDF', async () => {
    const res = await enviar(Buffer.from('codigo,periodo,nota\nMM-111,2024-1,85'), 'historial.pdf');
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/no es un PDF/);
  });

  it('400: PDF dañado', async () => {
    const res = await enviar(Buffer.from('%PDF-1.7\n esto no es un PDF de verdad'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/dañado/);
  });

  it('413: archivo de más de 10 MB', async () => {
    const grande = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(TAMANO_MAXIMO_PDF)]);
    const res = await enviar(grande);
    expect(res.status).toBe(413);
    expect((await res.json()).message).toMatch(/10 MB/);
  });

  it('422: PDF sin capa de texto (escaneado)', async () => {
    const res = await enviar(construirPdf([[], []]));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/escaneado/);
  });
});
