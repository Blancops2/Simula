import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestUser } from '../auth/decorators/current-user.decorator';
import { EstadoPeriodo } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CambiarEstadoPeriodoDto } from './dto/cambiar-estado-periodo.dto';
import { CreatePeriodoDto } from './dto/create-periodo.dto';
import { UpdatePeriodoDto } from './dto/update-periodo.dto';

export interface PeriodoView {
  id: string;
  anno: string;
  periodo: string;
  estado: string;
  fechaInicio: Date | null;
  fechaFin: Date | null;
  periodoActual: boolean;
}

@Injectable()
export class PeriodoService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CreatePeriodoDto): Promise<PeriodoView> {
    const anno = String(dto.anno);
    const periodo = String(dto.periodo);

    // La BD ya tiene UNIQUE(anno, periodo) (UQ_periodo_anno_periodo); se
    // valida también aquí para devolver un 409 con mensaje claro en vez del
    // error crudo de SQL Server ante una violación de restricción.
    const existente = await this.prisma.periodo.findFirst({ where: { anno, periodo } });
    if (existente) {
      throw new ConflictException(`Ya existe un período registrado para el año ${anno}, período ${periodo}.`);
    }

    const ahora = new Date();
    const creado = await this.prisma.periodo.create({
      data: {
        idperiodo: randomUUID(),
        anno,
        periodo,
        estado: dto.estado ?? EstadoPeriodo.HABILITADO,
        FechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined,
        fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : undefined,
        createdAt: ahora,
        updatedAt: ahora,
      },
    });

    return this.toView(creado);
  }

  async listar(): Promise<PeriodoView[]> {
    const periodos = await this.prisma.periodo.findMany({
      orderBy: [{ anno: 'desc' }, { periodo: 'desc' }],
    });
    return periodos.map((p) => this.toView(p));
  }

  // Períodos que un estudiante puede consultar/seleccionar (HU1/HU2, ver
  // comentario del modelo Periodo en schema.prisma): solo los que el admin
  // dejó habilitados.
  async listarHabilitados(): Promise<PeriodoView[]> {
    const periodos = await this.prisma.periodo.findMany({
      where: { estado: EstadoPeriodo.HABILITADO },
      orderBy: [{ anno: 'desc' }, { periodo: 'desc' }],
    });
    return periodos.map((p) => this.toView(p));
  }

  async cambiarEstado(
    id: string,
    dto: CambiarEstadoPeriodoDto,
    currentUser: RequestUser,
  ): Promise<PeriodoView> {
    const actual = await this.prisma.periodo.findUnique({ where: { idperiodo: id } });
    if (!actual) {
      throw new NotFoundException('El período indicado no existe.');
    }

    // Si el estado ya es el solicitado no hay "cambio" que auditar (criterio
    // 5): se devuelve el período tal cual, sin tocar Auditoria.
    if (actual.estado === dto.estado) {
      return this.toView(actual);
    }
    // El período actual tiene que seguir disponible para el estudiante.
    if (actual.periodoActual && dto.estado !== EstadoPeriodo.HABILITADO) {
      throw new BadRequestException(
        'No se puede deshabilitar el período actual: marca otro período como actual primero.',
      );
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const periodo = await tx.periodo.update({
        where: { idperiodo: id },
        data: { estado: dto.estado, updatedAt: new Date() },
      });
      // createdAt se fija a mano porque la columna no tiene DEFAULT en BD
      // (ver DDL.sql): sin esto, el "cuándo" del criterio 5 quedaría null.
      await tx.auditoria.create({
        data: {
          idAuditoria: randomUUID(),
          entidad: 'periodo',
          idEntidad: id,
          campo: 'estado',
          valorAnterior: actual.estado,
          valorNuevo: dto.estado,
          idUser: currentUser.userId,
          createdAt: new Date(),
        },
      });
      return periodo;
    });

    return this.toView(actualizado);
  }

  // Marca el período actual (criterio 4 de trazabilidad: el estudiante
  // consulta sus simulaciones del período actual). Solo hay uno: el anterior
  // se desmarca en la misma transacción (la BD lo garantiza también con
  // UQ_periodo_periodoActual). Tiene que estar habilitado. Cada cambio queda
  // en Auditoria, igual que el de estado.
  async marcarActual(id: string, currentUser: RequestUser): Promise<PeriodoView> {
    const nuevo = await this.prisma.periodo.findUnique({ where: { idperiodo: id } });
    if (!nuevo) {
      throw new NotFoundException('El período indicado no existe.');
    }
    if (nuevo.periodoActual) {
      return this.toView(nuevo);
    }
    if (nuevo.estado !== EstadoPeriodo.HABILITADO) {
      throw new BadRequestException('Solo un período habilitado puede ser el período actual.');
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const anterior = await tx.periodo.findFirst({ where: { periodoActual: true } });
      const ahora = new Date();
      if (anterior) {
        await tx.periodo.update({
          where: { idperiodo: anterior.idperiodo },
          data: { periodoActual: false, updatedAt: ahora },
        });
      }
      const periodo = await tx.periodo.update({
        where: { idperiodo: id },
        data: { periodoActual: true, updatedAt: ahora },
      });
      const auditar = (idEntidad: string, valorAnterior: string, valorNuevo: string) => ({
        idAuditoria: randomUUID(),
        entidad: 'periodo',
        idEntidad,
        campo: 'periodoActual',
        valorAnterior,
        valorNuevo,
        idUser: currentUser.userId,
        createdAt: ahora,
      });
      await tx.auditoria.createMany({
        data: [
          ...(anterior ? [auditar(anterior.idperiodo, 'true', 'false')] : []),
          auditar(id, 'false', 'true'),
        ],
      });
      return periodo;
    });

    return this.toView(actualizado);
  }

  async actualizar(id: string, dto: UpdatePeriodoDto): Promise<PeriodoView> {
    const actual = await this.prisma.periodo.findUnique({ where: { idperiodo: id } });
    if (!actual) {
      throw new NotFoundException('El período indicado no existe.');
    }

    const anno = dto.anno !== undefined ? String(dto.anno) : (actual.anno ?? '');
    const periodo = dto.periodo !== undefined ? String(dto.periodo) : (actual.periodo ?? '');

    // Solo se re-valida el duplicado si año o período realmente cambian;
    // NOT: idEntidad propio para no chocar contra la fila que se está editando.
    if (dto.anno !== undefined || dto.periodo !== undefined) {
      const duplicado = await this.prisma.periodo.findFirst({
        where: { anno, periodo, NOT: { idperiodo: id } },
      });
      if (duplicado) {
        throw new ConflictException(`Ya existe un período registrado para el año ${anno}, período ${periodo}.`);
      }
    }

    const actualizado = await this.prisma.periodo.update({
      where: { idperiodo: id },
      data: {
        anno,
        periodo,
        FechaInicio: dto.fechaInicio !== undefined ? new Date(dto.fechaInicio) : undefined,
        fechaFin: dto.fechaFin !== undefined ? new Date(dto.fechaFin) : undefined,
        updatedAt: new Date(),
      },
    });

    return this.toView(actualizado);
  }

  private toView(p: {
    idperiodo: string;
    anno: string | null;
    periodo: string | null;
    estado: string | null;
    FechaInicio: Date | null;
    fechaFin: Date | null;
    periodoActual: boolean;
  }): PeriodoView {
    return {
      id: p.idperiodo,
      anno: p.anno ?? '',
      periodo: p.periodo ?? '',
      estado: p.estado ?? '',
      fechaInicio: p.FechaInicio,
      fechaFin: p.fechaFin,
      periodoActual: p.periodoActual,
    };
  }
}
