// Generador mínimo de PDF digitales para las pruebas (sin dependencias):
// cada texto se escribe en Helvetica en la posición exacta indicada, así las
// pruebas controlan columnas, márgenes y saltos de página.

export interface TextoPdf {
  x: number;
  y: number;
  texto: string;
  tamano?: number;
}

export interface OpcionesPdf {
  ancho?: number;
  alto?: number;
  titulo?: string;
  autor?: string;
}

// WinAnsiEncoding coincide con latin1 para tildes y eñes; lo demás se escapa.
function cadenaPdf(texto: string): string {
  let salida = '';
  for (const c of texto) {
    const code = c.charCodeAt(0);
    if (c === '(' || c === ')' || c === '\\') salida += '\\' + c;
    else if (code < 32 || code > 126) salida += '\\' + (code & 0xff).toString(8).padStart(3, '0');
    else salida += c;
  }
  return `(${salida})`;
}

export function construirPdf(paginas: TextoPdf[][], opciones: OpcionesPdf = {}): Buffer {
  const ancho = opciones.ancho ?? 612;
  const alto = opciones.alto ?? 792;
  const objetos: string[] = [];
  const agregar = (cuerpo: string) => objetos.push(cuerpo) && objetos.length;

  const catalogo = agregar(''); // se completa al final
  const raiz = agregar('');
  const fuente = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const info = agregar(
    `<< /Title ${cadenaPdf(opciones.titulo ?? 'Documento de prueba')} /Author ${cadenaPdf(opciones.autor ?? 'Simula')} ` +
      '/Creator (construirPdf) >>',
  );

  const hojas: number[] = [];
  for (const textos of paginas) {
    const contenido = textos
      .map((t) => `BT /F1 ${t.tamano ?? 10} Tf ${t.x} ${t.y} Td ${cadenaPdf(t.texto)} Tj ET`)
      .join('\n');
    const flujo = agregar(`<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`);
    hojas.push(
      agregar(
        `<< /Type /Page /Parent ${raiz} 0 R /MediaBox [0 0 ${ancho} ${alto}] ` +
          `/Resources << /Font << /F1 ${fuente} 0 R >> >> /Contents ${flujo} 0 R >>`,
      ),
    );
  }
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${raiz} 0 R >>`;
  objetos[raiz - 1] = `<< /Type /Pages /Kids [${hojas.map((h) => `${h} 0 R`).join(' ')}] /Count ${hojas.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((cuerpo, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const inicioXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// Historial de muestra: "Información básica" (Clave: valor en sus tres
// formas), una tabla de clases, varias páginas con encabezado repetido y
// número de página.
export function historialDeMuestra(): Buffer {
  const encabezado = (n: number): TextoPdf[] => [
    { x: 56, y: 760, texto: 'Universidad de Prueba - Historial Académico' },
    { x: 290, y: 30, texto: `Página ${n} de 2` },
  ];
  return construirPdf(
    [
      [
        ...encabezado(1),
        { x: 56, y: 680, texto: 'Información básica', tamano: 14 },
        { x: 56, y: 650, texto: 'Nombre: Ana María López' },
        { x: 56, y: 630, texto: 'Carrera:' },
        { x: 200, y: 630, texto: 'Ingeniería en Sistemas' },
        { x: 56, y: 610, texto: 'Correo:' },
        { x: 56, y: 595, texto: 'Ana.Lopez@Correo.com' },
        { x: 56, y: 575, texto: 'Fecha de expedición: 05/03/2026' },
        { x: 56, y: 555, texto: 'Índice académico: 84,5 %' },
        { x: 56, y: 535, texto: 'Más información en https://registro.ejemplo.edu' },
        { x: 56, y: 500, texto: 'Historial', tamano: 14 },
        { x: 56, y: 475, texto: 'Código' },
        { x: 150, y: 475, texto: 'Asignatura' },
        { x: 380, y: 475, texto: 'Período' },
        { x: 470, y: 475, texto: 'Nota' },
        { x: 56, y: 455, texto: 'MM-111' },
        { x: 150, y: 455, texto: 'Matemática I' },
        { x: 380, y: 455, texto: '2024-1' },
        { x: 470, y: 455, texto: '85' },
        { x: 56, y: 435, texto: 'IS-101' },
        { x: 150, y: 435, texto: 'Introducción a la Programación' },
        { x: 380, y: 435, texto: '2023-2' },
        { x: 470, y: 435, texto: '50' },
      ],
      [
        ...encabezado(2),
        { x: 56, y: 680, texto: 'Observaciones: el estudiante cursó la informa-' },
        { x: 56, y: 665, texto: 'ción complementaria sin pendientes.' },
        { x: 56, y: 640, texto: 'Total de U.V.: 1.500' },
      ],
    ],
    { titulo: 'Historial académico', autor: 'Registro' },
  );
}

// Historial que continúa en 3 páginas, repitiendo el encabezado de la tabla
// en cada una; la última página tiene una sola fila.
// Igual que el PDF del equipo: UV/CA (unidades valorativas) va después de Asignatura.
export const COLUMNAS_HISTORIAL = ['Código', 'Asignatura', 'UV/CA', 'Sección', 'Año', 'Periodo', 'Calif.', 'OBS.'];
const X_COLUMNAS = [72, 130, 290, 340, 400, 445, 500, 550];

export function historialMultipagina(): Buffer {
  const fila = (y: number, celdas: string[]): TextoPdf[] => celdas.map((texto, i) => ({ x: X_COLUMNAS[i], y, texto }));
  const filas = (yInicial: number, desde: number, cantidad: number): TextoPdf[] =>
    Array.from({ length: cantidad }, (_, i) =>
      fila(yInicial - i * 18, [`MAT-${100 + desde + i}`, `Asignatura ${desde + i}`, '4', '0700', '2024', '1', '88', 'APR']),
    ).flat();
  const comun = (n: number): TextoPdf[] => [
    { x: 160, y: 760, texto: 'UNIVERSIDAD DEL VALLE ESMERALDA' },
    { x: 290, y: 30, texto: `Página ${n} de 3` },
  ];
  return construirPdf([
    [
      ...comun(1),
      { x: 72, y: 640, texto: 'No. cuenta: 0020240099' },
      { x: 72, y: 625, texto: 'Nombre: Daniela Sofía Ramírez Ortega' },
      { x: 72, y: 610, texto: 'Carrera: Ingeniería de Sistemas' },
      { x: 72, y: 580, texto: 'Indice Global: 80' },
      ...fila(540, COLUMNAS_HISTORIAL),
      ...filas(520, 1, 20),
    ],
    [...comun(2), ...fila(730, COLUMNAS_HISTORIAL), ...filas(710, 21, 30)],
    [...comun(3), ...fila(730, COLUMNAS_HISTORIAL), ...filas(710, 51, 1), { x: 72, y: 650, texto: 'APR = Aprobada' }],
  ]);
}

// Historial seguido de una tabla de equivalencias (clases de otra
// institución) que empieza a mitad de la página 2 y continúa en la 3. El
// encabezado institucional de cada página menciona "Historial", pero cae en
// el margen y no debe cambiar de sección.
export const COLUMNAS_EQUIVALENCIAS = ['Código', 'Asignatura', 'Institución de origen', 'Asignatura cursada', 'Calif.'];
const X_EQUIVALENCIAS = [80, 150, 280, 400, 540];

export function historialConEquivalencias(): Buffer {
  const fila = (y: number, celdas: string[], xs = X_COLUMNAS): TextoPdf[] =>
    celdas.map((texto, i) => ({ x: xs[i], y, texto }));
  const clases = (yInicial: number, desde: number, cantidad: number): TextoPdf[] =>
    Array.from({ length: cantidad }, (_, i) =>
      fila(yInicial - i * 18, [`MAT-${100 + desde + i}`, `Asignatura ${desde + i}`, '4', '0700', '2024', '1', '88', 'APR']),
    ).flat();
  const equivalencia = (y: number, n: number): TextoPdf[] =>
    fila(y, [`EQ-${n}`, `Equivalente ${n}`, 'Universidad Anterior', `Curso origen ${n}`, '80'], X_EQUIVALENCIAS);
  const comun = (n: number): TextoPdf[] => [
    { x: 160, y: 760, texto: 'UNIVERSIDAD DEL VALLE ESMERALDA - HISTORIAL ACADÉMICO' },
    { x: 290, y: 30, texto: `Página ${n} de 3` },
  ];
  return construirPdf([
    [
      ...comun(1),
      { x: 72, y: 640, texto: 'No. cuenta: 20240099123' },
      { x: 72, y: 625, texto: 'Nombre: Daniela Sofía Ramírez Ortega' },
      { x: 72, y: 610, texto: 'Carrera: Ingeniería de Sistemas' },
      { x: 72, y: 570, texto: '2. Historial de Calificaciones' },
      ...fila(540, COLUMNAS_HISTORIAL),
      ...clases(520, 1, 15),
    ],
    [
      ...comun(2),
      ...fila(730, COLUMNAS_HISTORIAL),
      ...clases(710, 16, 5),
      { x: 72, y: 600, texto: '3. Equivalencias' },
      ...fila(575, COLUMNAS_EQUIVALENCIAS, X_EQUIVALENCIAS),
      ...equivalencia(555, 1),
      ...equivalencia(537, 2),
    ],
    [...comun(3), ...fila(730, COLUMNAS_EQUIVALENCIAS, X_EQUIVALENCIAS), ...equivalencia(710, 3)],
  ]);
}

// Estructura del PDF de prueba del equipo (v2): el título "2. Equivalencias"
// queda huérfano al pie de la página 1 (dentro del margen inferior) y la
// tabla de equivalencias, con las MISMAS columnas que el historial, está en
// la página 2. Antes se ignoraba el título y las equivalencias se pegaban
// al historial.
export function equivalenciasConTituloAlPie(): Buffer {
  const fila = (y: number, celdas: string[]): TextoPdf[] => celdas.map((texto, i) => ({ x: X_COLUMNAS[i], y, texto }));
  const comun = (n: number): TextoPdf[] => [
    { x: 184, y: 749, texto: 'DOCUMENTO DE PRUEBA — NO OFICIAL — DATOS FICTICIOS' },
    { x: 134, y: 36, texto: `Documento generado con datos ficticios · Página ${n}` },
  ];
  return construirPdf([
    [
      ...comun(1),
      { x: 72, y: 611, texto: 'No. cuenta: 20240099123' },
      { x: 72, y: 497, texto: '2. Historial de Calificaciones' },
      ...fila(473, COLUMNAS_HISTORIAL),
      ...fila(456, ['MAT-101', 'Matemática General', '5', '0700', '2024', '1', '88', 'APR']),
      ...fila(438, ['ESP-101', 'Redacción', '3', '0900', '2024', '1', '92', 'APR']),
      { x: 72, y: 63.5, texto: '2. Equivalencias' },
    ],
    [
      ...comun(2),
      ...fila(730, COLUMNAS_HISTORIAL),
      ...fila(713, ['SOC-101', 'Sociología', '3', '1100', '2024', '1', '81', 'APR']),
      ...fila(695, ['ING-101', 'Inglés Técnico I', '3', '1300', '2024', '1', '95', 'APR']),
    ],
  ]);
}

// Variante "documento real": el título de equivalencias viene partido en dos
// segmentos por un espacio de más ("3." … "Equivalencias") y una equivalencia
// no trae Sección, Año ni Periodo (celdas vacías).
export function equivalenciasConTituloPartidoYCeldasVacias(): Buffer {
  const fila = (y: number, celdas: string[]): TextoPdf[] =>
    celdas.flatMap((texto, i) => (texto ? [{ x: X_COLUMNAS[i], y, texto }] : []));
  return construirPdf([
    [
      { x: 72, y: 600, texto: '2. Historial de Calificaciones' },
      ...fila(570, COLUMNAS_HISTORIAL),
      ...fila(550, ['MAT-101', 'Matemática General', '5', '0700', '2024', '1', '88', 'APR']),
      { x: 72, y: 500, texto: '3.' },
      { x: 110, y: 500, texto: 'Equivalencias' },
      ...fila(470, COLUMNAS_HISTORIAL),
      ...fila(450, ['EQ-101', 'Contabilidad', '4', '', '', '', '80', 'EQV']),
      ...fila(430, ['EQ-102', 'Economía', '3', '0100', '2023', '2', '75', 'EQV']),
    ],
  ]);
}

// Estructura del historial real (UNAH, según captura del equipo; datos
// ficticios): el título "Equivalencias Reconocidas" queda al pie de la
// página 2 y la tabla está en la página 3, con un encabezado en DOS líneas
// y centrado ("CÓD." sobre "ASIGNATURA", "CÓD." sobre "EQUIVALENTE"); los
// encabezados de una sola línea quedan a media altura.
export const COLUMNAS_EQUIVALENCIAS_UNAH = ['CÓD. ASIGNATURA', 'ASIGNATURA CURSADA', 'CÓD. EQUIVALENTE', 'ASIGNATURA EQUIVALENTE'];

export function equivalenciasEstiloUnah(): Buffer {
  const pie = (n: number): TextoPdf[] => [
    { x: 20, y: 40, texto: `UNAH — Historial Académico (20240099123) Página ${n} de 3`, tamano: 7 },
    { x: 500, y: 40, texto: '22/09/2026 10:59:02', tamano: 7 },
  ];
  const historial = (y: number, c: string[]): TextoPdf[] =>
    c.map((texto, i) => ({ x: [30, 110, 330, 400, 450, 500][i], y, texto, tamano: 8 }));
  const eq = (y: number, c: string[]): TextoPdf[] =>
    [
      { x: 36, texto: c[0] },
      { x: 108, texto: c[1] },
      { x: 368, texto: c[2] },
      { x: 426, texto: c[3] },
    ].map((t) => ({ ...t, y, tamano: 7 }));
  return construirPdf([
    [
      { x: 20, y: 700, texto: 'No. cuenta: 20240099123' },
      { x: 20, y: 685, texto: 'Nombre: Daniela Sofía Ramírez Ortega' },
      { x: 20, y: 670, texto: 'Carrera: Ingeniería en Sistemas' },
      { x: 20, y: 630, texto: 'Historial Académico', tamano: 14 },
      ...historial(600, ['CÓDIGO', 'ASIGNATURA', 'UV', 'AÑO', 'PERIODO', 'CALIF.']),
      ...historial(580, ['MM110', 'MATEMATICA I', '5', '2024', '1', '80']),
      ...pie(1),
    ],
    [
      ...historial(740, ['MM111', 'GEOMETRIA', '5', '2024', '2', '75']),
      { x: 20, y: 90, texto: 'Equivalencias Reconocidas', tamano: 14 },
      ...pie(2),
    ],
    [
      // Encabezado en dos líneas, centrado; los de una sola línea a media altura.
      { x: 37, y: 700, texto: 'CÓD.', tamano: 7 },
      { x: 22, y: 692, texto: 'ASIGNATURA', tamano: 7 },
      { x: 108, y: 696, texto: 'ASIGNATURA CURSADA', tamano: 7 },
      { x: 352, y: 700, texto: 'CÓD.', tamano: 7 },
      { x: 337, y: 692, texto: 'EQUIVALENTE', tamano: 7 },
      { x: 426, y: 696, texto: 'ASIGNATURA EQUIVALENTE', tamano: 7 },
      ...eq(670, ['EE101', 'ESPAÑOL', 'EG011', 'ESPANOL GENERAL']),
      ...eq(652, ['SC101', 'SOCIOLOGIA', 'SC101', 'SOCIOLOGIA']),
      ...eq(634, ['HH101', 'HISTORIA DE HONDURAS', 'HH101', 'HISTORIA DE HONDURAS']),
      ...eq(616, ['FF101', 'FILOSOFIA', 'FF101', 'FILOSOFIA I']),
      ...eq(598, ['IN101', 'INGLES I', 'IN101', 'INGLES I']),
      { x: 35, y: 550, texto: 'NOTA DE VALIDACIÓN: Verifique la autenticidad escaneando el código QR. Recibo No.: 123456 | ID: 98765', tamano: 7 },
      ...pie(3),
    ],
  ]);
}
