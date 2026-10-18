import { CleanPage, TextLine } from './extraccion.types';
import { InterpretacionService, detectarTipo, normalizarClave, parsearNumero } from './interpretacion.service';

const linea = (...segments: string[]): TextLine => ({ y: 0, x: 0, segments, text: segments.join(' ') });
const pagina = (...lines: TextLine[]): CleanPage => ({ page: 1, lines });

describe('detectarTipo', () => {
  it.each([
    ['Ana@Correo.com', 'email', 'ana@correo.com'],
    ['05/03/2026', 'fecha', '2026-03-05'],
    ['05-03-2026', 'fecha', '2026-03-05'],
    ['2026-03-05', 'fecha', '2026-03-05'],
    ['29/02/2024', 'fecha', '2024-02-29'],
    ['12,5 %', 'porcentaje', 12.5],
    ['80%', 'porcentaje', 80],
    ['$ 1.234.567,89', 'moneda', 1234567.89],
    ['1500 COP', 'moneda', 1500],
    ['L. 2,500.50', 'moneda', 2500.5],
    ['1.500', 'numero', 1500],
    ['1,234.56', 'numero', 1234.56],
    ['1.234,56', 'numero', 1234.56],
    ['12,5', 'numero', 12.5],
    ['85', 'numero', 85],
    ['-3,25', 'numero', -3.25],
    ['0,125', 'numero', 0.125],
    ['36 meses', 'texto', '36 meses'],
    ['2024-1', 'texto', '2024-1'],
    ['MM-111', 'texto', 'MM-111'],
  ])('%s → %s', (valor, type, normalized) => {
    expect(detectarTipo(valor)).toEqual({ type, normalized });
  });

  it.each(['31/02/2026', '29/02/2025', '00/01/2026', '15/13/2026'])('rechaza la fecha imposible %s', (valor) => {
    expect(detectarTipo(valor).type).toBe('texto');
  });
});

describe('parsearNumero', () => {
  it('rechaza agrupaciones de miles mal formadas', () => {
    expect(parsearNumero('1.23.456')).toBeNull();
    expect(parsearNumero('12.34.5')).toBeNull();
    expect(parsearNumero('1,2,3')).toBeNull();
  });

  it('usa el último separador como decimal cuando aparecen ambos', () => {
    expect(parsearNumero('1,234,567.8')).toBe(1234567.8);
    expect(parsearNumero('1.234.567,8')).toBe(1234567.8);
  });
});

describe('normalizarClave', () => {
  it.each([
    ['Fecha de expedición', 'fecha_de_expedicion'],
    ['  Índice Académico ', 'indice_academico'],
    ['Nº de cuenta', 'n_de_cuenta'],
    ['Total de U.V.', 'total_de_u_v'],
    ['Año/Período', 'ano_periodo'],
  ])('%s → %s', (clave, esperado) => {
    expect(normalizarClave(clave)).toBe(esperado);
  });
});

describe('InterpretacionService', () => {
  const servicio = new InterpretacionService();

  it('detecta campos en un solo segmento, en dos segmentos y en la línea siguiente', () => {
    const { fields } = servicio.interpretar([
      pagina(linea('Plazo: 36 meses'), linea('Carrera:', 'Ingeniería en Sistemas'), linea('Correo:'), linea('Ana@Correo.com')),
    ]);
    expect(fields.map((f) => [f.key, f.value, f.type])).toEqual([
      ['Plazo', '36 meses', 'texto'],
      ['Carrera', 'Ingeniería en Sistemas', 'texto'],
      ['Correo', 'Ana@Correo.com', 'email'],
    ]);
    expect(fields[2]).toMatchObject({ keyNormalized: 'correo', normalized: 'ana@correo.com', page: 1 });
  });

  it('no genera campos a partir de URLs ni de horas', () => {
    const { fields } = servicio.interpretar([
      pagina(linea('https://registro.ejemplo.edu'), linea('Más información en https://x.edu'), linea('10:30')),
    ]);
    expect(fields).toEqual([]);
  });

  it('no toma como valor un segmento que es otra clave', () => {
    const { fields } = servicio.interpretar([pagina(linea('Nombre:', 'Carrera: Sistemas'))]);
    expect(fields.map((f) => f.key)).toEqual(['Carrera']);
  });

  it('detecta tablas de 2+ líneas consecutivas con el mismo número de segmentos (3+)', () => {
    const { tables } = servicio.interpretar([
      pagina(
        linea('Historial'),
        linea('Código', 'Asignatura', 'Nota'),
        linea('MM-111', 'Matemática I', '85'),
        linea('IS-101', 'Programación', '50'),
        linea('Total', '2'),
        linea('A', 'B', 'C', 'D'),
      ),
    ]);
    expect(tables).toEqual([
      {
        page: 1,
        columns: 3,
        rows: [
          ['Código', 'Asignatura', 'Nota'],
          ['MM-111', 'Matemática I', '85'],
          ['IS-101', 'Programación', '50'],
        ],
      },
    ]);
  });

  it('corta la tabla cuando cambia el número de columnas', () => {
    const { tables } = servicio.interpretar([
      pagina(linea('a', 'b', 'c'), linea('d', 'e', 'f'), linea('g', 'h', 'i', 'j'), linea('k', 'l', 'm', 'n')),
    ]);
    expect(tables.map((t) => t.columns)).toEqual([3, 4]);
  });
});
