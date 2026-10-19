import { UnprocessableEntityException } from '@nestjs/common';
import { EstadoHistorial, OrigenHistorial } from '../common/enums';
import { ExtraccionPdfService } from '../documentos/extraccion-pdf.service';
import { HistorialExtraido } from '../documentos/extraccion.types';
import { PrismaService } from '../prisma/prisma.service';
import { GuardarHistorialPdfService } from './guardar-historial-pdf.service';

// Prisma simulado: las lecturas devuelven datos fijos y las escrituras
// devuelven una descripción de la operación, que $transaction recibe tal cual.
function prismaFalso(opciones: { anterior?: boolean; existentes?: object[]; sinPeriodoReservado?: boolean } = {}) {
  const mallas = [
    { idPlantillaMalla: 'V2', nombre: 'Malla 2026', version: 2, activa: true, plantillaOrigenId: opciones.anterior ? 'V1' : 'V2' },
    { idPlantillaMalla: 'V1', nombre: 'Malla 2020', version: 1, activa: false, plantillaOrigenId: 'V1' },
  ];
  const clasesPorMalla: Record<string, string[]> = {
    V2: ['MAT-101', 'ESP-101', 'EG-011'],
    V1: ['MAT-101', 'ESP-101', 'SOC-101', 'ING-101'],
  };
  const pmc = Object.entries(clasesPorMalla).flatMap(([malla, codigos]) =>
    codigos.map((codigo) => ({
      idPlantillaMalla: malla,
      idPlantillaMalla_has_Clase: `${malla}:${codigo}`,
      clase: { codigo },
    })),
  );
  const transaccion: unknown[] = [];
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ idUser: 'u1' }) },
    carrera: {
      findMany: jest.fn().mockResolvedValue([{ idCarrera: 'ISC', nombre: 'Ingenieria en Sistemas Computacionales' }]),
    },
    plantillaMalla: {
      findFirst: jest.fn().mockResolvedValue(mallas[0]),
      findUnique: jest.fn(({ where }) => Promise.resolve(mallas.find((m) => m.idPlantillaMalla === where.idPlantillaMalla))),
    },
    plantillaMalla_has_Clase: {
      findMany: jest.fn(({ where }) => {
        const ids: string[] = where.idPlantillaMalla.in ?? [where.idPlantillaMalla];
        return Promise.resolve(pmc.filter((p) => ids.includes(p.idPlantillaMalla)));
      }),
    },
    periodo: {
      findMany: jest.fn().mockResolvedValue([
        { idperiodo: 'P241', anno: '2024', periodo: '1' },
        { idperiodo: 'P242', anno: '2024', periodo: '2' },
        ...(opciones.sinPeriodoReservado ? [] : [{ idperiodo: 'PER-0000-0', anno: '0000', periodo: '0' }]),
      ]),
    },
    historialAcademico: {
      findMany: jest.fn().mockResolvedValue(opciones.existentes ?? []),
      createMany: jest.fn((args) => ({ op: 'createMany', ...args })),
      update: jest.fn((args) => ({ op: 'update', ...args })),
    },
    plantillaMalla_has_User: {
      deleteMany: jest.fn((args) => ({ op: 'deleteAsignacion', ...args })),
      create: jest.fn((args) => ({ op: 'createAsignacion', ...args })),
    },
    $transaction: jest.fn((ops: unknown[]) => {
      transaccion.push(...ops);
      return Promise.resolve(ops);
    }),
  };
  return { prisma, transaccion };
}

const COLUMNAS = ['Código', 'Asignatura', 'UV/CA', 'Sección', 'Año', 'Periodo', 'Calif.', 'OBS.'];
const fila = (codigo: string, anno: string, periodo: string, calif: string, page = 1) => ({
  page,
  cells: [codigo, `Clase ${codigo}`, '4', '0700', anno, periodo, calif, ''],
});

function historial(parcial: Partial<HistorialExtraido> = {}): HistorialExtraido {
  return {
    estudiante: {
      numeroCuenta: { etiqueta: 'No. cuenta', valor: '20240099123', page: 1 },
      nombre: { etiqueta: 'Nombre', valor: 'Ana', page: 1 },
      carrera: { etiqueta: 'Carrera', valor: 'INGENIERÍA EN SISTEMAS COMPUTACIONALES', page: 1 },
    },
    clases: {
      columns: COLUMNAS,
      rows: [
        fila('MAT101', '2024', '1', '88'),
        fila('ESP101', '2024', '1', '50'),
        fila('ESP101', '2024', '2', 'NSP'),
        fila('XYZ999', '2024', '1', '90'),
        fila('MAT101', '2024', '3', '70'),
      ],
    },
    equivalencias: null,
    faltantes: [],
    ...parcial,
  };
}

function crearServicio(h: HistorialExtraido, opciones?: Parameters<typeof prismaFalso>[0]) {
  const { prisma, transaccion } = prismaFalso(opciones);
  const extraccion = { extraer: jest.fn().mockResolvedValue({ historial: h }) } as unknown as ExtraccionPdfService;
  const servicio = new GuardarHistorialPdfService(prisma as unknown as PrismaService, extraccion);
  return { servicio, prisma, transaccion };
}

describe('GuardarHistorialPdfService', () => {
  it('asigna la malla y guarda solo las clases que están en ella, informando las demás', async () => {
    const { servicio, transaccion } = crearServicio(historial());
    const r = await servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));

    expect(r.carrera).toEqual({ id: 'ISC', nombre: 'Ingenieria en Sistemas Computacionales' });
    expect(r.malla).toMatchObject({ id: 'V2', coincidencias: 2 });
    expect(r.mallaAlternativa).toBeNull();
    expect(r).toMatchObject({ totalClases: 5, creadas: 3, actualizadas: 0, omitidasAdmin: 0 });
    expect(r.noCargadas.map((n) => [n.codigo, n.motivo])).toEqual([
      ['XYZ999', 'La clase no está en la malla de tu carrera.'],
      ['MAT101', 'El período 2024-3 no está registrado. Pide al administrador que lo registre.'],
    ]);

    const [borrar, asignar, crear] = transaccion as { op: string; data: never }[];
    expect(borrar).toMatchObject({ op: 'deleteAsignacion', where: { idUser: 'u1' } });
    expect(asignar).toMatchObject({ op: 'createAsignacion', data: { idPlantillaMalla: 'V2', idUser: 'u1' } });
    expect(crear.op).toBe('createMany');
    expect(crear.data).toEqual([
      expect.objectContaining({ idPlantillaMalla_has_Clase: 'V2:MAT-101', idperiodo: 'P241', estado: EstadoHistorial.APROBADA, nota: '88', seccion: '0700', origen: OrigenHistorial.AUTOREPORTE }),
      expect.objectContaining({ idPlantillaMalla_has_Clase: 'V2:ESP-101', idperiodo: 'P241', estado: EstadoHistorial.REPROBADA, nota: '50' }),
      expect.objectContaining({ idPlantillaMalla_has_Clase: 'V2:ESP-101', idperiodo: 'P242', estado: EstadoHistorial.NSP, nota: null }),
    ]);
  });

  it('elige la versión anterior si coincide con más clases (y la informa con la alternativa)', async () => {
    const h = historial({
      clases: { columns: COLUMNAS, rows: [fila('MAT101', '2024', '1', '88'), fila('SOC101', '2024', '1', '80'), fila('ING101', '2024', '2', '90')] },
    });
    const { servicio } = crearServicio(h, { anterior: true });
    const r = await servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));
    expect(r.malla).toMatchObject({ id: 'V1', coincidencias: 3 });
    expect(r.mallaAlternativa).toMatchObject({ id: 'V2', coincidencias: 1 });
    expect(r.creadas).toBe(3);
  });

  it('si empatan, se queda con la versión más reciente', async () => {
    const h = historial({ clases: { columns: COLUMNAS, rows: [fila('MAT101', '2024', '1', '88')] } });
    const { servicio } = crearServicio(h, { anterior: true });
    const r = await servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));
    expect(r.malla.id).toBe('V2');
    expect(r.mallaAlternativa?.coincidencias).toBe(1);
  });

  const equivalenciasUnah = {
    columns: ['CÓD. ASIGNATURA', 'ASIGNATURA CURSADA', 'CÓD. EQUIVALENTE', 'ASIGNATURA EQUIVALENTE'],
    rows: [
      { page: 3, cells: ['EE101', 'ESPAÑOL', 'EG011', 'ESPANOL GENERAL'] },
      { page: 3, cells: ['QQ101', 'QUIMICA', 'QQ101', 'QUIMICA GENERAL'] },
    ],
  };

  it('las equivalencias cuentan para elegir la malla, por el código equivalente', async () => {
    const h = historial({ clases: { columns: COLUMNAS, rows: [fila('MAT101', '2024', '1', '88')] }, equivalencias: equivalenciasUnah });
    const { servicio } = crearServicio(h, { anterior: true });
    const r = await servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));
    // Sin la equivalencia empatarían; EG-011 solo está en V2.
    expect(r.malla).toMatchObject({ id: 'V2', coincidencias: 2 });
  });

  it('guarda las equivalencias como aprobadas, en el período reservado "0000", sin nota ni sección', async () => {
    const h = historial({ clases: { columns: COLUMNAS, rows: [fila('MAT101', '2024', '1', '88')] }, equivalencias: equivalenciasUnah });
    const { servicio, transaccion } = crearServicio(h);
    const r = await servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));

    expect(r.equivalencias).toEqual({
      encontradas: 2,
      creadas: 1,
      actualizadas: 0,
      omitidasAdmin: 0,
      periodoReservadoDisponible: true,
    });
    expect(r.creadas).toBe(1);
    // La que no está en la malla se informa, con su asignatura equivalente.
    expect(r.noCargadas).toEqual([
      { codigo: 'QQ101', asignatura: 'QUIMICA GENERAL', periodo: 'Equivalencia', motivo: 'La clase no está en la malla de tu carrera.', page: 3 },
    ]);
    const crear = (transaccion as { op: string; data: unknown[] }[]).find((o) => o.op === 'createMany');
    expect(crear?.data).toContainEqual(
      expect.objectContaining({
        idPlantillaMalla_has_Clase: 'V2:EG-011',
        idperiodo: 'PER-0000-0',
        origen: OrigenHistorial.EQUIVALENCIA,
        estado: EstadoHistorial.APROBADA,
        nota: null,
        seccion: null,
      }),
    );
  });

  it('si aún no existe el período reservado, no guarda equivalencias (pero sí el resto) y lo informa', async () => {
    const h = historial({ clases: { columns: COLUMNAS, rows: [fila('MAT101', '2024', '1', '88')] }, equivalencias: equivalenciasUnah });
    const { servicio, transaccion } = crearServicio(h, { sinPeriodoReservado: true });
    const r = await servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));
    expect(r.equivalencias).toMatchObject({ encontradas: 2, creadas: 0, periodoReservadoDisponible: false });
    expect(r.creadas).toBe(1);
    const crear = (transaccion as { op: string; data: unknown[] }[]).find((o) => o.op === 'createMany');
    expect(crear?.data).toHaveLength(1);
  });

  it('una fila repetida en el PDF reemplaza a la anterior sin contarse dos veces', async () => {
    const h = historial({
      clases: { columns: COLUMNAS, rows: [fila('MAT101', '2024', '1', '50'), fila('MAT101', '2024', '1', '90')] },
    });
    const { servicio, transaccion } = crearServicio(h);
    const r = await servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));
    expect(r).toMatchObject({ creadas: 1, actualizadas: 0 });
    const crear = (transaccion as { op: string; data: unknown[] }[]).find((o) => o.op === 'createMany');
    expect(crear?.data).toEqual([expect.objectContaining({ nota: '90', estado: EstadoHistorial.APROBADA })]);
  });

  it('no toca lo registrado por el administrador y actualiza lo autorreportado', async () => {
    const existentes = [
      { idHistorialAcademico: 'H1', idPlantillaMalla_has_Clase: 'V2:MAT-101', idperiodo: 'P241', origen: OrigenHistorial.ADMIN },
      { idHistorialAcademico: 'H2', idPlantillaMalla_has_Clase: 'V2:ESP-101', idperiodo: 'P241', origen: OrigenHistorial.AUTOREPORTE },
    ];
    const { servicio, transaccion } = crearServicio(historial(), { existentes });
    const r = await servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));
    expect(r).toMatchObject({ creadas: 1, actualizadas: 1, omitidasAdmin: 1 });
    const update = (transaccion as { op: string }[]).find((o) => o.op === 'update');
    expect(update).toMatchObject({
      where: { idHistorialAcademico: 'H2' },
      data: { estado: EstadoHistorial.REPROBADA, nota: '50', seccion: '0700' },
    });
  });

  it.each([
    ['sin carrera en el PDF', { estudiante: { ...historial().estudiante, carrera: { etiqueta: null, valor: null, page: null } } }, /carrera en el PDF/],
    ['carrera no registrada', { estudiante: { ...historial().estudiante, carrera: { etiqueta: 'Carrera', valor: 'Medicina', page: 1 } } }, /no está registrada/],
    ['sin tabla de historial', { clases: null }, /tabla del historial/],
    ['ninguna clase coincide', { clases: { columns: COLUMNAS, rows: [fila('XYZ999', '2024', '1', '90')] } }, /Ninguna clase/],
  ])('rechaza con 422: %s, sin escribir nada', async (_caso, parcial, mensaje) => {
    const { servicio, prisma } = crearServicio(historial(parcial as Partial<HistorialExtraido>));
    const promesa = servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'));
    await expect(promesa).rejects.toThrow(UnprocessableEntityException);
    await expect(promesa).rejects.toThrow(mensaje);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza con 422 si la carrera no tiene malla activa', async () => {
    const { servicio, prisma } = crearServicio(historial());
    prisma.plantillaMalla.findFirst.mockResolvedValueOnce(null);
    await expect(servicio.guardar('u1', 'h.pdf', Buffer.from('%PDF-'))).rejects.toThrow(/malla activa/);
  });
});
