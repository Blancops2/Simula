import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as passport from 'passport';
import { Role } from '../common/enums';
import { DocumentosModule } from './documentos.module';
import { ExtractionResult } from './extraccion.types';
import { TAMANO_MAXIMO_PDF } from './extraccion-pdf.controller';
import { construirPdf, historialDeMuestra } from './testing/construir-pdf';

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
