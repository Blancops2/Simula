import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EstadoHistorial, OrigenHistorial } from '../common/enums';
import { esPeriodoSinPeriodo } from '../common/periodo-sin-periodo';
import { ExtraccionPdfService } from '../documentos/extraccion-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MallaCandidata,
  buscarCarrera,
  codigosDeTabla,
  columnaAsignaturaEquivalencia,
  columnaCodigoEquivalencia,
  columnasDeHistorial,
  elegirMalla,
  interpretarFilaHistorial,
  normalizarCodigo,
} from './guardado-historial.reglas';

export interface MallaDetectada {
  id: string;
  nombre: string | null;
  version: number | null;
  activa: boolean;
  coincidencias: number;
}

export interface ClaseNoCargada {
  codigo: string;
  asignatura: string;
  periodo: string;
  motivo: string;
  page: number;
}

export interface ResultadoGuardadoHistorial {
  carrera: { id: string; nombre: string | null };
  malla: MallaDetectada;
  // La otra versión evaluada (si la carrera tiene versión anterior).
  mallaAlternativa: MallaDetectada | null;
  totalClases: number;
  creadas: number;
  actualizadas: number;
  // Ya registradas por el administrador: no se sobrescriben.
  omitidasAdmin: number;
  noCargadas: ClaseNoCargada[];
  // Las equivalencias que no están en la malla van en `noCargadas` (con
  // período "Equivalencia").
  equivalencias: {
    encontradas: number;
    creadas: number;
    actualizadas: number;
    omitidasAdmin: number;
    // false si aún no existe el período reservado "0000" (script de datos
    // 2026-10-19_periodo_sin_periodo.sql pendiente): las equivalencias no se
    // guardan, pero sí cuentan para elegir la malla.
    periodoReservadoDisponible: boolean;
  };
}

const MOTIVO_NO_EN_MALLA = 'La clase no está en la malla de tu carrera.';
const PERIODO_EQUIVALENCIA = 'Equivalencia';

// Guarda en el historial del estudiante lo que se extrae del PDF. El PDF se
// vuelve a extraer en el servidor (no se confía en datos enviados por el
// navegador), así que se guarda exactamente lo que el estudiante verificó.
@Injectable()
export class GuardarHistorialPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly extraccion: ExtraccionPdfService,
  ) {}

  async guardar(userId: string, fileName: string, buffer: Buffer): Promise<ResultadoGuardadoHistorial> {
    const usuario = await this.prisma.user.findUnique({ where: { idUser: userId } });
    if (!usuario) throw new NotFoundException('El estudiante no existe.');

    const { historial } = await this.extraccion.extraer(fileName, buffer);
    const { clases, equivalencias } = historial;

    // 1. Carrera, por el nombre que trae el PDF.
    const nombreCarrera = historial.estudiante.carrera.valor;
    if (!nombreCarrera) {
      throw new UnprocessableEntityException('No se encontró la carrera en el PDF; no se puede guardar el historial.');
    }
    const busqueda = buscarCarrera(
      await this.prisma.carrera.findMany({ select: { idCarrera: true, nombre: true } }),
      nombreCarrera,
    );
    if (busqueda.tipo === 'no_encontrada') {
      throw new UnprocessableEntityException(
        `La carrera "${nombreCarrera}" no está registrada en el sistema. Contacta al administrador.`,
      );
    }
    if (busqueda.tipo === 'ambigua') {
      throw new UnprocessableEntityException(
        `La carrera "${nombreCarrera}" coincide con varias carreras registradas ` +
          `(${busqueda.candidatas.map((c) => c.nombre).join(', ')}). Contacta al administrador.`,
      );
    }
    const carrera = busqueda.carrera;

    if (!clases || clases.rows.length === 0) {
      throw new UnprocessableEntityException('No se encontró la tabla del historial en el PDF.');
    }

    // 2. Versión de malla: la activa y, como máximo, su versión anterior
    // (plantillaOrigenId). Gana la que tenga más clases del historial.
    const candidatas = await this.mallasCandidatas(carrera.idCarrera, carrera.nombre);
    const columnas = columnasDeHistorial(clases.columns);
    if (columnas.codigo === -1) {
      throw new UnprocessableEntityException('La tabla del historial no tiene una columna de código de clase.');
    }
    const columnaEquivalente = columnaCodigoEquivalencia(equivalencias?.columns ?? []);
    const codigosEquivalencias = codigosDeTabla(equivalencias, columnaEquivalente);
    const codigosHistorial = new Set([...codigosDeTabla(clases, columnas.codigo), ...codigosEquivalencias]);

    const eleccion = elegirMalla(candidatas, codigosHistorial)!;
    if (eleccion.coincidencias === 0) {
      throw new UnprocessableEntityException(
        `Ninguna clase del historial coincide con las mallas de ${carrera.nombre}. Verifica que el PDF sea tu historial.`,
      );
    }
    const malla = eleccion.malla;

    // 3. Qué se crea, qué se actualiza y qué no se carga.
    const pmcs = await this.prisma.plantillaMalla_has_Clase.findMany({
      where: { idPlantillaMalla: malla.idPlantillaMalla },
      include: { clase: true },
    });
    const pmcPorCodigo = new Map(
      pmcs
        .filter((p) => p.clase.codigo)
        .map((p) => [normalizarCodigo(p.clase.codigo!), p.idPlantillaMalla_has_Clase] as const),
    );
    const [periodos, existentes] = await Promise.all([
      this.prisma.periodo.findMany(),
      this.prisma.historialAcademico.findMany({ where: { idUser: userId } }),
    ]);
    const idPeriodoPorClave = new Map(periodos.map((p) => [`${p.anno}-${p.periodo}`, p.idperiodo] as const));
    const existentePorClave = new Map<string, (typeof existentes)[number]>(
      existentes.map((h) => [`${h.idPlantillaMalla_has_Clase}|${h.idperiodo}`, h]),
    );

    const noCargadas: ClaseNoCargada[] = [];
    // Por clave clase|período: si el PDF repite una fila, gana la última.
    const aCrear = new Map<string, Prisma.HistorialAcademicoCreateManyInput>();
    const aActualizar = new Map<string, { id: string; data: Prisma.HistorialAcademicoUpdateInput }>();
    let omitidasAdmin = 0;
    const ahora = new Date();

    // Crea o actualiza (nunca sobre un registro del administrador). Devuelve
    // qué hizo, para llevar la cuenta por separado de clases y equivalencias.
    const registrar = (
      pmcId: string,
      idperiodo: string,
      origen: OrigenHistorial,
      datos: { estado: string | null; nota: string | null; seccion: string | null },
    ): 'creada' | 'actualizada' | 'admin' | 'repetida' => {
      const clave = `${pmcId}|${idperiodo}`;
      const existente = existentePorClave.get(clave);
      if (existente?.origen === OrigenHistorial.ADMIN) return 'admin';
      // Fila repetida en el PDF: reemplaza a la anterior, sin contarse dos veces.
      const yaPendiente = aCrear.has(clave) || aActualizar.has(clave);
      if (existente) {
        aActualizar.set(clave, { id: existente.idHistorialAcademico, data: { ...datos, origen, updatedAt: ahora } });
        return yaPendiente ? 'repetida' : 'actualizada';
      }
      aCrear.set(clave, {
        idHistorialAcademico: randomUUID(),
        idUser: userId,
        idPlantillaMalla_has_Clase: pmcId,
        idperiodo,
        origen,
        ...datos,
        createdAt: ahora,
        updatedAt: ahora,
      });
      return yaPendiente ? 'repetida' : 'creada';
    };
    let clasesCreadas = 0;
    let clasesActualizadas = 0;

    for (const fila of clases.rows) {
      const cells = fila.cells;
      const descartar = (motivo: string) =>
        noCargadas.push({
          codigo: cells[columnas.codigo] ?? '',
          asignatura: columnas.asignatura !== -1 ? cells[columnas.asignatura] ?? '' : '',
          periodo: [cells[columnas.anno], cells[columnas.periodo]].filter(Boolean).join('-'),
          motivo,
          page: fila.page,
        });

      const leida = interpretarFilaHistorial(cells, columnas);
      if (!leida.valida) {
        descartar(leida.motivo);
        continue;
      }
      const pmcId = pmcPorCodigo.get(leida.codigo);
      if (!pmcId) {
        descartar(MOTIVO_NO_EN_MALLA);
        continue;
      }
      const idperiodo = idPeriodoPorClave.get(`${leida.anno}-${leida.periodo}`);
      if (!idperiodo) {
        descartar(`El período ${leida.anno}-${leida.periodo} no está registrado. Pide al administrador que lo registre.`);
        continue;
      }

      const hecho = registrar(pmcId, idperiodo, OrigenHistorial.AUTOREPORTE, {
        estado: leida.estado,
        nota: leida.nota,
        seccion: leida.seccion,
      });
      if (hecho === 'admin') omitidasAdmin++;
      else if (hecho === 'creada') clasesCreadas++;
      else if (hecho === 'actualizada') clasesActualizadas++;
    }

    // Equivalencias: aprobadas (si el documento las lista como equivalencias,
    // se acreditaron), en el período reservado "0000", sin nota ni sección
    // (el PDF no los trae y no se inventan); origen EQUIVALENCIA.
    const periodoReservado = periodos.find((p) => esPeriodoSinPeriodo(p)) ?? null;
    const eq = { creadas: 0, actualizadas: 0, omitidasAdmin: 0 };
    if (equivalencias && periodoReservado) {
      const columnaAsignatura = columnaAsignaturaEquivalencia(equivalencias.columns);
      for (const fila of equivalencias.rows) {
        const codigo = normalizarCodigo(fila.cells[columnaEquivalente] ?? '');
        const pmcId = codigo ? pmcPorCodigo.get(codigo) : undefined;
        if (!pmcId) {
          noCargadas.push({
            codigo: fila.cells[columnaEquivalente] ?? '',
            asignatura: columnaAsignatura !== -1 ? fila.cells[columnaAsignatura] ?? '' : '',
            periodo: PERIODO_EQUIVALENCIA,
            motivo: codigo ? MOTIVO_NO_EN_MALLA : 'Sin código de clase.',
            page: fila.page,
          });
          continue;
        }
        const hecho = registrar(pmcId, periodoReservado.idperiodo, OrigenHistorial.EQUIVALENCIA, {
          estado: EstadoHistorial.APROBADA,
          nota: null,
          seccion: null,
        });
        if (hecho === 'admin') eq.omitidasAdmin++;
        else if (hecho === 'creada') eq.creadas++;
        else if (hecho === 'actualizada') eq.actualizadas++;
      }
    }

    // 4. Todo en una transacción: asignar la malla (reemplaza la anterior,
    // igual que la asignación del administrador) y escribir el historial.
    await this.prisma.$transaction([
      this.prisma.plantillaMalla_has_User.deleteMany({ where: { idUser: userId } }),
      this.prisma.plantillaMalla_has_User.create({
        data: { idPlantillaMalla: malla.idPlantillaMalla, idUser: userId, estado: 'activo' },
      }),
      ...(aCrear.size > 0 ? [this.prisma.historialAcademico.createMany({ data: [...aCrear.values()] })] : []),
      ...[...aActualizar.values()].map((u) =>
        this.prisma.historialAcademico.update({ where: { idHistorialAcademico: u.id }, data: u.data }),
      ),
    ]);

    const detalle = (m: MallaCandidata, coincidencias: number): MallaDetectada => ({
      id: m.idPlantillaMalla,
      nombre: m.nombre,
      version: m.version,
      activa: m.activa,
      coincidencias,
    });
    return {
      carrera: { id: carrera.idCarrera, nombre: carrera.nombre },
      malla: detalle(malla, eleccion.coincidencias),
      mallaAlternativa: eleccion.alternativa
        ? detalle(eleccion.alternativa.malla, eleccion.alternativa.coincidencias)
        : null,
      totalClases: clases.rows.length,
      creadas: clasesCreadas,
      actualizadas: clasesActualizadas,
      omitidasAdmin,
      noCargadas,
      equivalencias: {
        encontradas: equivalencias?.rows.length ?? 0,
        ...eq,
        periodoReservadoDisponible: periodoReservado !== null,
      },
    };
  }

  // La malla activa de la carrera y su versión anterior (plantillaOrigenId),
  // si apunta a otra malla. Una carrera solo tiene una malla activa.
  private async mallasCandidatas(idCarrera: string, nombreCarrera: string | null): Promise<MallaCandidata[]> {
    const activa = await this.prisma.plantillaMalla.findFirst({ where: { idCarrera, activa: true } });
    if (!activa) {
      throw new UnprocessableEntityException(
        `La carrera ${nombreCarrera ?? ''} no tiene una malla activa. Contacta al administrador.`,
      );
    }
    const anterior =
      activa.plantillaOrigenId && activa.plantillaOrigenId !== activa.idPlantillaMalla
        ? await this.prisma.plantillaMalla.findUnique({ where: { idPlantillaMalla: activa.plantillaOrigenId } })
        : null;

    const mallas = [activa, ...(anterior ? [anterior] : [])];
    const clases = await this.prisma.plantillaMalla_has_Clase.findMany({
      where: { idPlantillaMalla: { in: mallas.map((m) => m.idPlantillaMalla) } },
      select: { idPlantillaMalla: true, clase: { select: { codigo: true } } },
    });
    return mallas.map((m) => ({
      idPlantillaMalla: m.idPlantillaMalla,
      nombre: m.nombre,
      version: m.version === null ? null : Number(m.version),
      activa: m.activa ?? false,
      codigos: new Set(
        clases
          .filter((c) => c.idPlantillaMalla === m.idPlantillaMalla && c.clase.codigo)
          .map((c) => normalizarCodigo(c.clase.codigo!)),
      ),
    }));
  }
}
