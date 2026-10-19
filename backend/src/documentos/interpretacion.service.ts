import { Injectable } from '@nestjs/common';
import { CleanPage, DetectedTable, ExtractedField, TipoDato } from './extraccion.types';

export interface ValorTipado {
  type: TipoDato;
  normalized: string | number;
}

export interface ResultadoInterpretacion {
  fields: ExtractedField[];
  tables: DetectedTable[];
}

// "Clave: valor" (valor posiblemente vacío). La clave debe tener al menos una
// letra, para no confundir horas (10:30) con campos.
const CLAVE_VALOR = /^([^:]{1,60}):(.*)$/;
const MIN_COLUMNAS_TABLA = 3;
const MIN_FILAS_TABLA = 2;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_DMA = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const FECHA_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const PORCENTAJE = /^([+-]?\d[\d.,]*)\s*%$/;
const MONEDA_PREFIJO = /^(?:US\$|\$|€|L\.|COP|USD|EUR|HNL|MXN)\s*([+-]?\d[\d.,]*)$/i;
const MONEDA_SUFIJO = /^([+-]?\d[\d.,]*)\s*(?:COP|USD|EUR|HNL|MXN|€)$/i;
const NUMERO = /^[+-]?\d[\d.,]*$/;

export function normalizarClave(clave: string): string {
  return clave
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Formato español (1.234,56) o inglés (1,234.56): el último separador es el
// decimal, salvo que lo sigan exactamente 3 dígitos y sea el único tipo de
// separador (1.500 = mil quinientos). Devuelve null si no es un número válido.
export function parsearNumero(texto: string): number | null {
  const s = texto.trim();
  if (!NUMERO.test(s)) return null;
  const signo = s.startsWith('-') ? -1 : 1;
  const cuerpo = s.replace(/^[+-]/, '');

  const ultimoPunto = cuerpo.lastIndexOf('.');
  const ultimaComa = cuerpo.lastIndexOf(',');
  const posDecimal = Math.max(ultimoPunto, ultimaComa);
  if (posDecimal === -1) return signo * Number(cuerpo);

  const sepDecimal = cuerpo[posDecimal];
  const ambos = ultimoPunto !== -1 && ultimaComa !== -1;
  const vecesSep = cuerpo.split(sepDecimal).length - 1;
  const tras = cuerpo.slice(posDecimal + 1);

  let entera: string;
  let decimales: string;
  // "0,125" no es ciento veinticinco: un grupo inicial en cero solo puede ser decimal.
  const enteraEsCero = /^0+$/.test(cuerpo.slice(0, posDecimal));
  if (!ambos && (vecesSep > 1 || (tras.length === 3 && !enteraEsCero))) {
    // Solo separadores de miles.
    entera = cuerpo;
    decimales = '';
  } else {
    entera = cuerpo.slice(0, posDecimal);
    decimales = tras;
    if (!/^\d+$/.test(decimales)) return null;
  }

  const sepMiles = ambos ? (sepDecimal === '.' ? ',' : '.') : sepDecimal;
  const grupos = entera.split(sepMiles);
  if (grupos.length > 1) {
    if (!/^\d{1,3}$/.test(grupos[0]) || grupos.slice(1).some((g) => !/^\d{3}$/.test(g))) return null;
  } else if (!/^\d+$/.test(entera)) {
    return null;
  }
  return signo * Number(grupos.join('') + (decimales ? '.' + decimales : ''));
}

function fechaIso(anio: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d.toISOString().slice(0, 10);
}

// Orden: email → fecha → porcentaje → moneda → número → texto.
export function detectarTipo(valor: string): ValorTipado {
  const v = valor.trim();

  if (EMAIL.test(v)) return { type: 'email', normalized: v.toLowerCase() };

  const dma = FECHA_DMA.exec(v);
  const iso = FECHA_ISO.exec(v);
  const fecha = dma
    ? fechaIso(Number(dma[3]), Number(dma[2]), Number(dma[1]))
    : iso
      ? fechaIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))
      : null;
  if (fecha) return { type: 'fecha', normalized: fecha };

  const pct = PORCENTAJE.exec(v);
  const nPct = pct ? parsearNumero(pct[1]) : null;
  if (nPct !== null) return { type: 'porcentaje', normalized: nPct };

  const mon = MONEDA_PREFIJO.exec(v) ?? MONEDA_SUFIJO.exec(v);
  const nMon = mon ? parsearNumero(mon[1]) : null;
  if (nMon !== null) return { type: 'moneda', normalized: nMon };

  const n = parsearNumero(v);
  if (n !== null) return { type: 'numero', normalized: n };

  return { type: 'texto', normalized: v };
}

// Separa "Clave: valor" de un segmento. Descarta URLs (https://...) y
// claves sin letras.
export function separarClaveValor(segmento: string): { key: string; value: string } | null {
  const m = CLAVE_VALOR.exec(segmento);
  if (!m) return null;
  const key = m[1].trim();
  const value = m[2].trim();
  if (!/\p{L}/u.test(key) || m[2].startsWith('//')) return null;
  return { key, value };
}

// Interpretación GENÉRICA: no conoce campos del negocio. Las reglas por tipo
// de documento (ver ReglasHistorialService) trabajan sobre este resultado,
// buscando campos por keyNormalized, sin tocar la extracción ni la limpieza.
@Injectable()
export class InterpretacionService {
  interpretar(pages: CleanPage[]): ResultadoInterpretacion {
    return { fields: this.detectarCampos(pages), tables: this.detectarTablas(pages) };
  }

  detectarTipo(valor: string): ValorTipado {
    return detectarTipo(valor);
  }

  private detectarCampos(pages: CleanPage[]): ExtractedField[] {
    const fields: ExtractedField[] = [];
    const agregar = (key: string, value: string, page: number) =>
      fields.push({ key, keyNormalized: normalizarClave(key), value, ...detectarTipo(value), page });

    for (const { page, lines } of pages) {
      for (let li = 0; li < lines.length; li++) {
        const segs = lines[li].segments;
        for (let si = 0; si < segs.length; si++) {
          const par = separarClaveValor(segs[si]);
          if (!par) continue;

          // 1. "Plazo: 36 meses" en un solo segmento.
          if (par.value) {
            agregar(par.key, par.value, page);
            continue;
          }
          // 2. "Plazo:" | "36 meses" en la misma línea.
          const siguienteSeg = segs[si + 1];
          if (siguienteSeg !== undefined) {
            if (!separarClaveValor(siguienteSeg)) {
              agregar(par.key, siguienteSeg, page);
              si++;
            }
            continue;
          }
          // 3. "Plazo:" sola en su línea y "36 meses" en la línea siguiente.
          const siguienteLinea = lines[li + 1];
          if (
            segs.length === 1 &&
            siguienteLinea?.segments.length === 1 &&
            !separarClaveValor(siguienteLinea.segments[0])
          ) {
            agregar(par.key, siguienteLinea.text, page);
            li++;
          }
        }
      }
    }
    return fields;
  }

  // Bloque de 2+ líneas consecutivas con el mismo número de segmentos (3+).
  private detectarTablas(pages: CleanPage[]): DetectedTable[] {
    const tables: DetectedTable[] = [];
    for (const { page, lines } of pages) {
      let bloque: string[][] = [];
      const cerrar = () => {
        if (bloque.length >= MIN_FILAS_TABLA) tables.push({ page, columns: bloque[0].length, rows: bloque });
        bloque = [];
      };
      for (const linea of lines) {
        const n = linea.segments.length;
        if (n < MIN_COLUMNAS_TABLA) {
          cerrar();
          continue;
        }
        if (bloque.length > 0 && bloque[0].length !== n) cerrar();
        bloque.push([...linea.segments]);
      }
      cerrar();
    }
    return tables;
  }
}
