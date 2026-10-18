import { RawPage, TextLine } from './extraccion.types';
import { LimpiezaTextoService, esNumeroDePagina, normalizarTexto } from './limpieza-texto.service';

// Página carta: 792 pt de alto → franja de margen por encima de 697 y por debajo de 95.
const ALTO = 792;
const linea = (y: number, ...segments: string[]): TextLine => ({ y, x: 56, segments, text: segments.join(' ') });
const pagina = (page: number, ...lines: TextLine[]): RawPage => ({ page, width: 612, height: ALTO, lines });

describe('normalizarTexto', () => {
  it('normaliza Unicode, quita invisibles, unifica espacios y comillas', () => {
    expect(normalizarTexto('Información')).toBe('Información');
    expect(normalizarTexto('pala­bra​')).toBe('palabra');
    expect(normalizarTexto('a    b')).toBe('a b');
    expect(normalizarTexto('“hola” ‘x’')).toBe('"hola" \'x\'');
  });
});

describe('esNumeroDePagina', () => {
  it.each(['Página 3', 'Pág. 3 de 10', 'pagina 2', '3 / 10', '- 3 -', '7', 'Page 4 of 9'])('%s', (t) => {
    expect(esNumeroDePagina(t)).toBe(true);
  });
  it.each(['Página web', 'Nota 85', '2024-1'])('no: %s', (t) => {
    expect(esNumeroDePagina(t)).toBe(false);
  });
});

describe('LimpiezaTextoService', () => {
  const servicio = new LimpiezaTextoService();

  it('quita números de página y encabezados/pies repetidos solo en el margen', () => {
    const { pages, removed } = servicio.limpiar([
      pagina(1, linea(760, 'Universidad - Historial'), linea(500, '7'), linea(30, 'Página 1 de 3')),
      pagina(2, linea(760, 'Universidad - Historial'), linea(500, 'Contenido'), linea(30, 'Página 2 de 3')),
      pagina(3, linea(500, 'Universidad - Historial'), linea(30, 'Emitido 2026')),
    ]);

    // El "7" del centro y el encabezado de la pág. 3 (fuera del margen) se conservan.
    expect(pages.map((p) => p.lines.map((l) => l.text))).toEqual([
      ['7'],
      ['Contenido'],
      ['Universidad - Historial', 'Emitido 2026'],
    ]);
    expect(removed).toEqual([
      { page: 1, text: 'Universidad - Historial', reason: 'encabezado_pie_repetido' },
      { page: 1, text: 'Página 1 de 3', reason: 'numero_pagina' },
      { page: 2, text: 'Universidad - Historial', reason: 'encabezado_pie_repetido' },
      { page: 2, text: 'Página 2 de 3', reason: 'numero_pagina' },
    ]);
  });

  it('compara encabezados reemplazando dígitos por #', () => {
    const { removed } = servicio.limpiar([
      pagina(1, linea(760, 'Reporte generado el 01/10/2026')),
      pagina(2, linea(760, 'Reporte generado el 02/10/2026')),
    ]);
    expect(removed.map((r) => r.reason)).toEqual(['encabezado_pie_repetido', 'encabezado_pie_repetido']);
  });

  it('no quita encabezados repetidos en documentos de una sola página', () => {
    const { pages, removed } = servicio.limpiar([pagina(1, linea(760, 'Universidad - Historial'))]);
    expect(pages[0].lines).toHaveLength(1);
    expect(removed).toEqual([]);
  });

  it('une palabras cortadas con guion si la línea siguiente empieza en minúscula', () => {
    const { pages, removed } = servicio.limpiar([
      pagina(
        1,
        linea(600, 'Se revisó la informa-'),
        linea(585, 'ción del estudiante'),
        linea(570, 'Ingeniería en Sistemas-'),
        linea(555, 'Tegucigalpa'),
        linea(540, 'docu-'),
        linea(525, 'mento'),
      ),
    ]);
    expect(pages[0].lines.map((l) => l.text)).toEqual([
      'Se revisó la información',
      'del estudiante',
      'Ingeniería en Sistemas-',
      'Tegucigalpa',
      'documento',
    ]);
    expect(removed).toEqual([{ page: 1, text: 'mento', reason: 'unida_con_guion' }]);
  });
});
