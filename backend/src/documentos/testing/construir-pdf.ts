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
