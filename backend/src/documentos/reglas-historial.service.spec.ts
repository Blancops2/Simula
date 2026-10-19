import { ExtractedField, RawLine, RawPage } from './extraccion.types';
import { ReglasHistorialService } from './reglas-historial.service';

const campo = (key: string, keyNormalized: string, value: string, page = 1): ExtractedField => ({
  key,
  keyNormalized,
  value,
  type: 'texto',
  normalized: value,
  page,
});
// y = 400: centro de la página (fuera de los márgenes, donde cuentan los títulos).
// Cada segmento en su columna: x = 0, 100, 200…
const lineaEn = (y: number, ...segments: string[]): RawLine => ({
  y,
  x: 0,
  segments,
  segmentsX: segments.map((_, i) => i * 100),
  segmentsEndX: segments.map((_, i) => i * 100 + 80),
  text: segments.join(' '),
});
const linea = (...segments: string[]): RawLine => lineaEn(400, ...segments);
// Fila con celdas vacías: [x, texto] de cada segmento presente.
const filaEn = (...celdas: [number, string][]): RawLine => ({
  y: 400,
  x: celdas[0][0],
  segments: celdas.map(([, t]) => t),
  segmentsX: celdas.map(([x]) => x),
  segmentsEndX: celdas.map(([x]) => x + 60),
  text: celdas.map(([, t]) => t).join(' '),
});
const pagina = (page: number, ...lines: RawLine[]): RawPage => ({ page, width: 612, height: 792, lines });

const ENCABEZADO = ['Código', 'Asignatura', 'Período', 'Nota'];

describe('ReglasHistorialService', () => {
  const reglas = new ReglasHistorialService();

  it('toma número de cuenta, nombre y carrera con distintas etiquetas posibles', () => {
    const { estudiante, faltantes } = reglas.aplicar(
      [
        campo('Indice Global', 'indice_global', '80'),
        campo('Número de cuenta', 'numero_de_cuenta', '0020240099'),
        campo('Nombre completo', 'nombre_completo', 'Ana López', 2),
        campo('Carrera', 'carrera', 'Ingeniería de Sistemas'),
      ],
      [],
    );
    expect(estudiante).toEqual({
      numeroCuenta: { etiqueta: 'Número de cuenta', valor: '0020240099', page: 1 },
      nombre: { etiqueta: 'Nombre completo', valor: 'Ana López', page: 2 },
      carrera: { etiqueta: 'Carrera', valor: 'Ingeniería de Sistemas', page: 1 },
    });
    expect(faltantes).toEqual(['Historial académico']);
  });

  it('reporta los datos que faltan', () => {
    const { estudiante, faltantes, clases } = reglas.aplicar([campo('Nombre', 'nombre', 'Ana')], []);
    expect(estudiante.numeroCuenta).toEqual({ etiqueta: null, valor: null, page: null });
    expect(clases).toBeNull();
    // Las equivalencias son opcionales: no cuentan como faltante.
    expect(faltantes).toEqual(['Número de cuenta', 'Carrera', 'Historial académico']);
  });

  it('une en una sola tabla el historial repartido en varias páginas, sin repetir el encabezado', () => {
    const { clases } = reglas.aplicar(
      [],
      [
        pagina(1, linea('Nombre: Ana'), linea(...ENCABEZADO), linea('MAT-101', 'Matemática', '2024-1', '88'), linea('APR = Aprobada')),
        pagina(2, linea(...ENCABEZADO), linea('MAT-102', 'Cálculo', '2024-2', '70'), linea('Página 2')),
        pagina(3, linea('Codigo', 'Asignatura', 'Periodo', 'Nota'), linea('INF-110', 'Programación', '2025-1', '95')),
      ],
    );
    expect(clases).toEqual({
      columns: ENCABEZADO,
      rows: [
        { page: 1, cells: ['MAT-101', 'Matemática', '2024-1', '88'] },
        { page: 2, cells: ['MAT-102', 'Cálculo', '2024-2', '70'] },
        { page: 3, cells: ['INF-110', 'Programación', '2025-1', '95'] },
      ],
    });
  });

  it('ignora tablas y líneas anteriores al encabezado del historial', () => {
    const { clases } = reglas.aplicar(
      [],
      [pagina(1, linea('A', 'B', 'C', 'D'), linea(...ENCABEZADO), linea('MAT-101', 'Matemática', '2024-1', '88'))],
    );
    expect(clases?.rows).toHaveLength(1);
  });

  it('normaliza el texto de las celdas (espacios no separables, invisibles)', () => {
    const { clases } = reglas.aplicar(
      [],
      [pagina(1, linea(...ENCABEZADO), linea('MAT-101', 'Matemática General​', '2024-1', '88'))],
    );
    expect(clases?.rows[0].cells[1]).toBe('Matemática General');
  });

  describe('encabezado en varias líneas', () => {
    // [x inicial, x final, texto] de cada segmento.
    const lineaConAnchos = (y: number, ...segs: [number, number, string][]): RawLine => ({
      y,
      x: segs[0][0],
      segments: segs.map(([, , t]) => t),
      segmentsX: segs.map(([x]) => x),
      segmentsEndX: segs.map(([, fin]) => fin),
      text: segs.map(([, , t]) => t).join(' '),
    });

    it('junta "CÓD." centrado sobre "ASIGNATURA" en una sola columna (estilo UNAH)', () => {
      const { equivalencias } = reglas.aplicar(
        [],
        [
          pagina(
            1,
            linea('Equivalencias Reconocidas'),
            lineaConAnchos(700, [37, 55, 'CÓD.'], [352, 370, 'CÓD.']),
            lineaConAnchos(696, [108, 180, 'ASIGNATURA CURSADA'], [426, 510, 'ASIGNATURA EQUIVALENTE']),
            lineaConAnchos(692, [22, 70, 'ASIGNATURA'], [337, 385, 'EQUIVALENTE']),
            lineaConAnchos(670, [36, 58, 'EE101'], [108, 140, 'ESPAÑOL'], [368, 390, 'EG011'], [426, 490, 'ESPANOL GENERAL']),
          ),
        ],
      );
      expect(equivalencias).toEqual({
        columns: ['CÓD. ASIGNATURA', 'ASIGNATURA CURSADA', 'CÓD. EQUIVALENTE', 'ASIGNATURA EQUIVALENTE'],
        rows: [{ page: 1, cells: ['EE101', 'ESPAÑOL', 'EG011', 'ESPANOL GENERAL'] }],
      });
    });

    it('no mete en el encabezado un subtítulo que esté justo encima', () => {
      const { clases } = reglas.aplicar(
        [],
        [
          pagina(
            1,
            lineaConAnchos(712, [0, 150, 'Detalle de asignaturas cursadas']),
            lineaEn(700, ...ENCABEZADO),
            linea('MAT-101', 'Matemática', '2024-1', '88'),
          ),
        ],
      );
      expect(clases?.columns).toEqual(ENCABEZADO);
    });

    it('exige al menos 3 columnas para un encabezado', () => {
      const { clases } = reglas.aplicar([], [pagina(1, linea('Código', 'Asignatura'), linea('MAT-101', 'Matemática'))]);
      expect(clases).toBeNull();
    });
  });

  describe('celdas vacías', () => {
    // Encabezado en x = 0, 100, 200, 300.
    it('ubica cada celda bajo su columna y deja vacías las que faltan', () => {
      const { clases } = reglas.aplicar(
        [],
        [pagina(1, linea(...ENCABEZADO), filaEn([0, 'EQ-1'], [102, 'Contabilidad'], [297, '80']))],
      );
      expect(clases?.rows).toEqual([{ page: 1, cells: ['EQ-1', 'Contabilidad', '', '80'] }]);
    });

    it('descarta líneas que no parecen filas (sin código o con menos de la mitad de las celdas)', () => {
      const { clases } = reglas.aplicar(
        [],
        [
          pagina(
            1,
            linea(...ENCABEZADO),
            filaEn([0, 'APR = Aprobada']),
            filaEn([100, 'Firma'], [300, 'Sello']),
            filaEn([0, 'EQ-1'], [40, 'pegado a la misma columna']),
            // Pie de página: tiene números, pero no empieza con un código.
            filaEn([0, 'UNAH Historial (20240099123) Página 3 de 3'], [300, '22/09/2026']),
          ),
        ],
      );
      expect(clases?.rows).toEqual([]);
    });
  });

  describe('equivalencias', () => {
    const COLS_EQ = ['Código', 'Asignatura', 'Institución de origen', 'Calif.'];

    it('separa la tabla que sigue al título "Equivalencias", aunque tenga las mismas columnas', () => {
      const { clases, equivalencias } = reglas.aplicar(
        [],
        [
          pagina(1, linea(...ENCABEZADO), linea('MAT-101', 'Matemática', '2024-1', '88'), linea('3. Equivalencias')),
          pagina(2, linea(...ENCABEZADO), linea('EQ-1', 'Contabilidad', '2023-2', '80')),
        ],
      );
      expect(clases?.rows.map((f) => f.cells[0])).toEqual(['MAT-101']);
      expect(equivalencias).toEqual({ columns: ENCABEZADO, rows: [{ page: 2, cells: ['EQ-1', 'Contabilidad', '2023-2', '80'] }] });
    });

    it('reconoce las equivalencias por sus columnas aunque no haya título', () => {
      const { clases, equivalencias } = reglas.aplicar(
        [],
        [
          pagina(
            1,
            linea(...ENCABEZADO),
            linea('MAT-101', 'Matemática', '2024-1', '88'),
            linea(...COLS_EQ),
            linea('EQ-1', 'Contabilidad', 'Universidad Anterior', '80'),
          ),
        ],
      );
      expect(clases?.rows).toHaveLength(1);
      expect(equivalencias?.columns).toEqual(COLS_EQ);
      expect(equivalencias?.rows.map((f) => f.cells[0])).toEqual(['EQ-1']);
    });

    it('vuelve al historial con un título "Historial" (equivalencias antes del historial)', () => {
      const { clases, equivalencias } = reglas.aplicar(
        [],
        [
          pagina(
            1,
            linea('Equivalencias'),
            linea(...ENCABEZADO),
            linea('EQ-1', 'Contabilidad', '2023-2', '80'),
            linea('Historial de calificaciones'),
            linea(...ENCABEZADO),
            linea('MAT-101', 'Matemática', '2024-1', '88'),
          ),
        ],
      );
      expect(equivalencias?.rows.map((f) => f.cells[0])).toEqual(['EQ-1']);
      expect(clases?.rows.map((f) => f.cells[0])).toEqual(['MAT-101']);
    });

    it('acepta un título huérfano al pie de la página, con la tabla en la página siguiente', () => {
      const { clases, equivalencias } = reglas.aplicar(
        [],
        [
          pagina(1, linea(...ENCABEZADO), linea('MAT-101', 'Matemática', '2024-1', '88'), lineaEn(63.5, '2. Equivalencias')),
          pagina(2, lineaEn(730, ...ENCABEZADO), lineaEn(713, 'EQ-1', 'Contabilidad', '2023-2', '80')),
        ],
      );
      expect(clases?.rows.map((f) => f.cells[0])).toEqual(['MAT-101']);
      expect(equivalencias?.rows.map((f) => f.cells[0])).toEqual(['EQ-1']);
    });

    it('no cambia de sección con un encabezado/pie repetido en varias páginas (encabezado institucional)', () => {
      const institucional = 'Universidad - Historial académico';
      const { clases, equivalencias } = reglas.aplicar(
        [],
        [
          pagina(1, lineaEn(760, institucional), linea(...ENCABEZADO), linea('MAT-101', 'Matemática', '2024-1', '88'), linea('Equivalencias')),
          pagina(2, lineaEn(760, institucional), linea(...ENCABEZADO), linea('EQ-1', 'Contabilidad', '2023-2', '80')),
        ],
        [
          { page: 1, text: institucional, reason: 'encabezado_pie_repetido' },
          { page: 2, text: institucional, reason: 'encabezado_pie_repetido' },
        ],
      );
      expect(clases?.rows.map((f) => f.cells[0])).toEqual(['MAT-101']);
      expect(equivalencias?.rows.map((f) => f.cells[0])).toEqual(['EQ-1']);
    });

    it.each([
      ['número separado por espacios de más', ['3.', 'Equivalencias']],
      ['letras espaciadas', ['E Q U I V A L E N C I A S']],
      ['título con un dato a la derecha', ['Equivalencias', 'Total U.V.: 9']],
      ['otra redacción', ['Equivalencia de asignaturas']],
    ])('reconoce el título partido o espaciado: %s', (_caso, titulo) => {
      const { clases, equivalencias } = reglas.aplicar(
        [],
        [
          pagina(
            1,
            linea(...ENCABEZADO),
            linea('MAT-101', 'Matemática', '2024-1', '88'),
            linea(...titulo),
            linea(...ENCABEZADO),
            linea('EQ-1', 'Contabilidad', '2023-2', '80'),
          ),
        ],
      );
      expect(clases?.rows.map((f) => f.cells[0])).toEqual(['MAT-101']);
      expect(equivalencias?.rows.map((f) => f.cells[0])).toEqual(['EQ-1']);
    });

    it('"Asignatura equivalente" es un nombre de columna, no un título', () => {
      const { clases, equivalencias } = reglas.aplicar(
        [],
        [
          pagina(
            1,
            lineaEn(500, ...ENCABEZADO),
            lineaEn(450, 'Asignatura equivalente'),
            lineaEn(400, 'MAT-101', 'Matemática', '2024-1', '88'),
          ),
        ],
      );
      expect(clases?.rows).toHaveLength(1);
      expect(equivalencias).toBeNull();
    });

    it('una clase llamada "Historia…" no cambia de sección', () => {
      const { equivalencias } = reglas.aplicar(
        [],
        [pagina(1, linea('Equivalencias'), linea(...ENCABEZADO), linea('Historia Latinoamericana'), linea('EQ-1', 'Historia', '2023-2', '80'))],
      );
      expect(equivalencias?.rows.map((f) => f.cells[0])).toEqual(['EQ-1']);
    });

    it('devuelve null si el PDF no tiene equivalencias', () => {
      const { equivalencias } = reglas.aplicar([], [pagina(1, linea(...ENCABEZADO), linea('MAT-101', 'Matemática', '2024-1', '88'))]);
      expect(equivalencias).toBeNull();
    });
  });
});
