import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RequestUser } from '../auth/decorators/current-user.decorator';
import { EstadoPeriodo } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PeriodoService } from './periodo.service';

// Período actual (criterio 4 de trazabilidad de simulaciones): lo marca el
// administrador, solo hay uno, tiene que estar habilitado y cada cambio queda
// en Auditoria.

type FilaPeriodo = {
  idperiodo: string;
  anno: string;
  periodo: string;
  estado: string;
  FechaInicio: Date | null;
  fechaFin: Date | null;
  periodoActual: boolean;
  updatedAt?: Date;
};

const ADMIN = { userId: 'USR-ADM-001' } as RequestUser;

function crearServicio(filas: FilaPeriodo[]) {
  const periodos = new Map(filas.map((f) => [f.idperiodo, { ...f }]));
  const auditoria: Record<string, unknown>[] = [];
  const tx = {
    periodo: {
      findFirst: async ({ where }: { where: { periodoActual: boolean } }) =>
        [...periodos.values()].find((p) => p.periodoActual === where.periodoActual) ?? null,
      update: async ({ where, data }: { where: { idperiodo: string }; data: Partial<FilaPeriodo> }) =>
        Object.assign(periodos.get(where.idperiodo)!, data),
    },
    auditoria: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        auditoria.push(...data);
        return { count: data.length };
      },
    },
  };
  const prisma = {
    periodo: {
      ...tx.periodo,
      findUnique: async ({ where }: { where: { idperiodo: string } }) => periodos.get(where.idperiodo) ?? null,
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const servicio = new PeriodoService(prisma as unknown as PrismaService);
  return { servicio, periodos, auditoria };
}

const periodo = (idperiodo: string, estado: string, periodoActual = false): FilaPeriodo => ({
  idperiodo,
  anno: '2026',
  periodo: idperiodo.slice(-1),
  estado,
  FechaInicio: null,
  fechaFin: null,
  periodoActual,
});

describe('PeriodoService — período actual', () => {
  it('marca el período como actual, desmarca el anterior y audita ambos cambios', async () => {
    const { servicio, periodos, auditoria } = crearServicio([
      periodo('PER-1', EstadoPeriodo.HABILITADO, true),
      periodo('PER-2', EstadoPeriodo.HABILITADO),
    ]);

    const vista = await servicio.marcarActual('PER-2', ADMIN);

    expect(vista).toMatchObject({ id: 'PER-2', periodoActual: true });
    expect(periodos.get('PER-1')!.periodoActual).toBe(false);
    expect(auditoria).toEqual([
      expect.objectContaining({ idEntidad: 'PER-1', campo: 'periodoActual', valorAnterior: 'true', valorNuevo: 'false', idUser: ADMIN.userId }),
      expect.objectContaining({ idEntidad: 'PER-2', campo: 'periodoActual', valorAnterior: 'false', valorNuevo: 'true', idUser: ADMIN.userId }),
    ]);
  });

  it('si no había período actual, solo audita el nuevo', async () => {
    const { servicio, auditoria } = crearServicio([periodo('PER-1', EstadoPeriodo.HABILITADO)]);

    await servicio.marcarActual('PER-1', ADMIN);

    expect(auditoria).toEqual([expect.objectContaining({ idEntidad: 'PER-1', valorNuevo: 'true' })]);
  });

  it('no hace nada si el período ya es el actual', async () => {
    const { servicio, auditoria } = crearServicio([periodo('PER-1', EstadoPeriodo.HABILITADO, true)]);

    await expect(servicio.marcarActual('PER-1', ADMIN)).resolves.toMatchObject({ periodoActual: true });
    expect(auditoria).toEqual([]);
  });

  it('rechaza un período deshabilitado o inexistente', async () => {
    const { servicio, periodos } = crearServicio([
      periodo('PER-1', EstadoPeriodo.HABILITADO, true),
      periodo('PER-2', EstadoPeriodo.DESHABILITADO),
    ]);

    await expect(servicio.marcarActual('PER-2', ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.marcarActual('PER-X', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    expect(periodos.get('PER-1')!.periodoActual).toBe(true);
  });

  it('no deja deshabilitar el período actual', async () => {
    const { servicio, periodos } = crearServicio([periodo('PER-1', EstadoPeriodo.HABILITADO, true)]);

    await expect(
      servicio.cambiarEstado('PER-1', { estado: EstadoPeriodo.DESHABILITADO } as never, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(periodos.get('PER-1')!.estado).toBe(EstadoPeriodo.HABILITADO);
  });
});
