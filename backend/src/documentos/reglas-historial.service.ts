import { Injectable } from '@nestjs/common';
import { DatoEstudiante, ExtractedField, HistorialExtraido, RawPage, RemovedLine, TablaClases } from './extraccion.types';
import { normalizarClave } from './interpretacion.service';
import { normalizarTexto } from './limpieza-texto.service';

// Reglas del documento "historial académico": a partir del resultado
// genérico se queda solo con lo que interesa. No toca la extracción ni la
// limpieza.

// Etiquetas posibles de cada dato, comparadas por keyNormalized.
const ETIQUETAS = {
  numeroCuenta: [
    'no_cuenta',
    'no_de_cuenta',
    'n_cuenta',
    'n_de_cuenta',
    'nro_cuenta',
    'nro_de_cuenta',
    'num_cuenta',
    'numero_cuenta',
    'numero_de_cuenta',
    'cuenta',
  ],
  nombre: ['nombre', 'nombre_completo', 'nombre_del_estudiante', 'estudiante', 'alumno'],
  carrera: ['carrera', 'programa', 'programa_academico'],
};

const NOMBRE_FALTANTE: Record<keyof typeof ETIQUETAS, string> = {
  numeroCuenta: 'Número de cuenta',
  nombre: 'Nombre',
  carrera: 'Carrera',
};

// Encabezado de una tabla de clases (historial o equivalencias): al menos 3
// columnas, una de código ("Código", "Cód.", "Cód. asignatura") y otra de
// asignatura. Se compara por palabras.
const PALABRAS_CODIGO = ['cod', 'codigo'];
const PALABRAS_ASIGNATURA = ['asignatura', 'asignaturas', 'materia', 'materias', 'clase', 'curso'];
const MIN_COLUMNAS_ENCABEZADO = 3;

// Columnas que solo tiene una tabla de equivalencias: si el encabezado trae
// alguna, la tabla es de equivalencias aunque no tenga título.
const PISTAS_COLUMNA_EQUIVALENCIA = ['equivalen', 'institucion', 'universidad', 'origen', 'procedencia'];

const LARGO_MAXIMO_TITULO = 80;
// Un título puede venir partido en pocos segmentos: "3." | "Equivalencias"
// (espacio de más tras el número) o "Equivalencias" | "Total U.V.: 9".
const MAXIMO_SEGMENTOS_TITULO = 3;
// Un encabezado puede ocupar varias líneas ("CÓD." sobre "ASIGNATURA"):
// líneas seguidas, sin números, a esta distancia vertical como máximo.
const SEPARACION_MAXIMA_ENCABEZADO = 14;
// Una fila con celdas vacías debe empezar con algo que parezca un código de
// clase (corto, con números: "MAT-101", "EE101") y traer al menos la mitad
// de las columnas; así no se cuelan pies de página, firmas, notas o leyendas.
const FRACCION_MINIMA_CELDAS = 0.5;
const LARGO_MAXIMO_CODIGO = 15;
// Holgura al ubicar una celda bajo su columna: los valores suelen empezar
// un poco antes o después que el texto del encabezado.
const HOLGURA_COLUMNA = 10;

type Seccion = 'clases' | 'equivalencias';

interface LineaPreparada {
  y: number;
  segments: string[];
  segmentsX: number[];
  segmentsEndX: number[];
}

interface Encabezado {
  columns: string[];
  columnsX: number[];
}

interface TablaEnCurso extends TablaClases {
  columnsX: number[];
}

const palabras = (texto: string) => normalizarClave(texto).split('_');
const tieneNumeros = (linea: LineaPreparada) => linea.segments.some((s) => /\d/.test(s));
const pareceCodigo = (texto: string) =>
  /\d/.test(texto) && texto.length <= LARGO_MAXIMO_CODIGO && texto.split(' ').length <= 2;

function esEncabezadoDeClases(columnas: string[]): boolean {
  const pal = columnas.map(palabras);
  return (
    columnas.length >= MIN_COLUMNAS_ENCABEZADO &&
    pal.some((p) => p.some((w) => PALABRAS_CODIGO.includes(w))) &&
    pal.some((p) => p.some((w) => PALABRAS_ASIGNATURA.includes(w)))
  );
}

// "E Q U I V A L E N C I A S" → "EQUIVALENCIAS": títulos con letras espaciadas.
function juntarLetrasEspaciadas(texto: string): string {
  const partes = texto.split(' ');
  return partes.length >= 4 && partes.filter((p) => p.length === 1).length >= partes.length * 0.8 ? partes.join('') : texto;
}

// Título de sección: una línea de pocos segmentos (no un encabezado de
// tabla). Puede caer en el margen (un título huérfano al pie de la página,
// con su tabla en la siguiente). Se exige el sustantivo "equivalencia(s)":
// "Asignatura equivalente" es un nombre de columna, no un título.
function seccionDeTitulo(segments: string[]): Seccion | null {
  if (segments.length > MAXIMO_SEGMENTOS_TITULO || segments.join(' ').length > LARGO_MAXIMO_TITULO) return null;
  if (esEncabezadoDeClases(segments)) return null;
  const claves = segments.map((s) => normalizarClave(juntarLetrasEspaciadas(s)));
  if (claves.some((c) => c.includes('equivalenc'))) return 'equivalencias';
  // Palabra completa: "Historia Latinoamericana" no es un título de historial.
  if (claves.some((c) => /(^|_)historial(_|$)/.test(c))) return 'clases';
  return null;
}

// Arma las columnas de un encabezado de una o varias líneas: los textos que
// se superponen horizontalmente son la misma columna ("CÓD." centrado sobre
// "ASIGNATURA" → "CÓD. ASIGNATURA"), leídos de arriba hacia abajo.
function columnasDeLineas(lineas: LineaPreparada[]): Encabezado {
  const textos = lineas
    .flatMap((l) => l.segments.map((t, i) => ({ t, y: l.y, x: l.segmentsX[i], fin: l.segmentsEndX[i] })))
    .sort((a, b) => a.x - b.x);
  const grupos: (typeof textos)[] = [];
  let finGrupo = -Infinity;
  for (const texto of textos) {
    if (grupos.length > 0 && texto.x <= finGrupo) {
      grupos[grupos.length - 1].push(texto);
      finGrupo = Math.max(finGrupo, texto.fin);
    } else {
      grupos.push([texto]);
      finGrupo = texto.fin;
    }
  }
  return {
    columns: grupos.map((g) => [...g].sort((a, b) => b.y - a.y || a.x - b.x).map((t) => t.t).join(' ')),
    columnsX: grupos.map((g) => g[0].x),
  };
}

// De un bloque de líneas seguidas sin números, toma el encabezado formado
// por las MENOS líneas posibles contando desde abajo (la última línea del
// bloque es la que queda pegada a las filas). Así no se cuela en los nombres
// de columna un subtítulo que esté justo encima.
function encabezadoDeBloque(bloque: LineaPreparada[]): Encabezado | null {
  for (let desde = bloque.length - 1; desde >= 0; desde--) {
    const encabezado = columnasDeLineas(bloque.slice(desde));
    if (esEncabezadoDeClases(encabezado.columns)) return encabezado;
  }
  return null;
}

// Ubica cada segmento bajo la columna del encabezado que le corresponde
// (la última cuyo inicio queda a su izquierda). Devuelve null si dos
// segmentos caen en la misma columna o si la fila no parece de la tabla.
function ubicarEnColumnas(tabla: TablaEnCurso, segments: string[], segmentsX: number[]): string[] | null {
  const cells = tabla.columns.map(() => '');
  for (let i = 0; i < segments.length; i++) {
    let col = -1;
    tabla.columnsX.forEach((x, c) => {
      if (x <= segmentsX[i] + HOLGURA_COLUMNA) col = c;
    });
    if (col === -1 || cells[col] !== '') return null;
    cells[col] = segments[i];
  }
  const llenas = cells.filter((c) => c !== '').length;
  if (!pareceCodigo(cells[0]) || llenas < tabla.columns.length * FRACCION_MINIMA_CELDAS) return null;
  return cells;
}

@Injectable()
export class ReglasHistorialService {
  // `removed` es lo que descartó la limpieza: de ahí salen los encabezados y
  // pies repetidos en cada página, que no deben cambiar de sección.
  aplicar(fields: ExtractedField[], rawPages: RawPage[], removed: RemovedLine[] = []): HistorialExtraido {
    const buscar = (claves: string[]): DatoEstudiante => {
      const campo = fields.find((f) => claves.includes(f.keyNormalized));
      // Se devuelve el texto tal cual (no el normalizado): un número de
      // cuenta es un identificador y no debe perder ceros a la izquierda.
      return campo ? { etiqueta: campo.key, valor: campo.value, page: campo.page } : { etiqueta: null, valor: null, page: null };
    };

    const estudiante = {
      numeroCuenta: buscar(ETIQUETAS.numeroCuenta),
      nombre: buscar(ETIQUETAS.nombre),
      carrera: buscar(ETIQUETAS.carrera),
    };
    const { clases, equivalencias } = this.unirTablas(rawPages, removed);

    const faltantes = (Object.keys(estudiante) as (keyof typeof estudiante)[])
      .filter((k) => estudiante[k].valor === null)
      .map((k) => NOMBRE_FALTANTE[k]);
    if (!clases) faltantes.push('Historial académico');

    return { estudiante, clases, equivalencias, faltantes };
  }

  // Las tablas del historial y de equivalencias suelen continuar en varias
  // páginas (y repetir su encabezado en cada una). El documento se recorre
  // por secciones: arranca en "clases" (historial) y cambia con un título
  // ("Equivalencias", "Historial de calificaciones") o con un encabezado que
  // trae columnas propias de equivalencias. En cada sección, el primer
  // encabezado fija las columnas y, desde ahí, cada línea con números y el
  // mismo número de columnas es una fila (o, si le faltan celdas, se ubica
  // columna por columna según la x del encabezado); los encabezados
  // repetidos se omiten.
  //
  // Encabezados: las líneas seguidas SIN números se juntan en un bloque (un
  // encabezado puede ocupar varias líneas, ej. "CÓD." sobre "ASIGNATURA") y
  // se evalúan al terminar el bloque (ver encabezadoDeBloque). Las filas, en
  // cambio, siempre traen números (el código de la clase).
  //
  // Trabajar sobre líneas (no sobre las tablas detectadas) evita perder una
  // última página con una sola fila, que no alcanza a ser "tabla" por sí
  // sola. Se usan las líneas CRUDAS (solo con el texto normalizado), no las
  // limpias: la regla de encabezados/pies repetidos compara con los dígitos
  // reemplazados por "#", y una fila que cae en el margen superior de varias
  // páginas ("MAT-121 … 88 APR" / "MAT-151 … 88 APR") se descartaba como
  // encabezado repetido, perdiendo clases.
  //
  // Un título cambia de sección esté donde esté (incluso al pie de la página,
  // con su tabla en la siguiente), salvo que sea un encabezado/pie repetido
  // en varias páginas: el encabezado institucional ("UNIVERSIDAD … –
  // HISTORIAL ACADÉMICO") no debe sacar la lectura de las equivalencias.
  private unirTablas(rawPages: RawPage[], removed: RemovedLine[]): Record<Seccion, TablaClases | null> {
    const repetidas = new Set(
      removed.filter((r) => r.reason === 'encabezado_pie_repetido').map((r) => `${r.page}|${r.text}`),
    );
    // Ruido según la limpieza (pies repetidos, números de página). Solo se
    // usa para descartar filas INCOMPLETAS: una fila completa se acepta
    // aunque la limpieza la haya descartado (ver el caso MAT-121/MAT-151).
    const ruido = new Set(
      removed.filter((r) => r.reason !== 'unida_con_guion').map((r) => `${r.page}|${r.text}`),
    );
    const tablas: Record<Seccion, TablaEnCurso | null> = { clases: null, equivalencias: null };
    let seccion: Seccion = 'clases';

    const registrarEncabezado = (bloque: LineaPreparada[]) => {
      const encabezado = bloque.length > 0 ? encabezadoDeBloque(bloque) : null;
      if (!encabezado) return;
      const claves = encabezado.columns.map(normalizarClave);
      if (claves.some((c) => PISTAS_COLUMNA_EQUIVALENCIA.some((pista) => c.includes(pista)))) {
        seccion = 'equivalencias';
      }
      // Si la sección ya tiene tabla, es el encabezado repetido de otra página.
      if (!tablas[seccion]) tablas[seccion] = { ...encabezado, rows: [] };
    };

    for (const { page, lines } of rawPages) {
      // Líneas seguidas sin números: posible encabezado (de una o varias líneas).
      let bloque: LineaPreparada[] = [];
      for (const linea of lines) {
        const pares = linea.segments
          .map((s, i) => [normalizarTexto(s), linea.segmentsX[i], linea.segmentsEndX[i]] as const)
          .filter(([s]) => s.length > 0);
        if (pares.length === 0) continue;
        const actual: LineaPreparada = {
          y: linea.y,
          segments: pares.map(([s]) => s),
          segmentsX: pares.map(([, x]) => x),
          segmentsEndX: pares.map(([, , fin]) => fin),
        };
        const ultima = bloque[bloque.length - 1];
        const continuaBloque =
          ultima !== undefined && !tieneNumeros(actual) && ultima.y - actual.y <= SEPARACION_MAXIMA_ENCABEZADO;

        // Un título nunca está dentro de un encabezado de varias líneas.
        if (!continuaBloque) {
          const repetida = repetidas.has(`${page}|${actual.segments.join(' ')}`);
          const titulo = repetida ? null : seccionDeTitulo(actual.segments);
          if (titulo) {
            registrarEncabezado(bloque);
            bloque = [];
            seccion = titulo;
            continue;
          }
        }

        if (!tieneNumeros(actual)) {
          if (!continuaBloque) {
            registrarEncabezado(bloque);
            bloque = [];
          }
          bloque.push(actual);
          continue;
        }

        registrarEncabezado(bloque);
        bloque = [];

        const tabla = tablas[seccion];
        if (!tabla) continue;
        if (actual.segments.length === tabla.columns.length) {
          tabla.rows.push({ page, cells: actual.segments });
        } else if (actual.segments.length < tabla.columns.length && !ruido.has(`${page}|${actual.segments.join(' ')}`)) {
          // Fila con celdas vacías (ej. una equivalencia sin sección ni período).
          const cells = ubicarEnColumnas(tabla, actual.segments, actual.segmentsX);
          if (cells) tabla.rows.push({ page, cells });
        }
      }
      registrarEncabezado(bloque);
    }
    const publica = (t: TablaEnCurso | null): TablaClases | null => (t ? { columns: t.columns, rows: t.rows } : null);
    return { clases: publica(tablas.clases), equivalencias: publica(tablas.equivalencias) };
  }
}
