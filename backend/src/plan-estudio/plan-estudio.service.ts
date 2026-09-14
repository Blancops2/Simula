import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanEstudioDto } from './dto/create-plan-estudio.dto';
import { UpdatePlanEstudioDto } from './dto/update-plan-estudio.dto';

export interface PlanEstudioView {
  id: string;
  idPlantillaMalla: string;
  anno: string;
  periodo: string;
  clasesIds: string[];
}

@Injectable()
export class PlanEstudioService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CreatePlanEstudioDto): Promise<PlanEstudioView> {
    const plantilla = await this.prisma.plantillaMalla.findUnique({
      where: { idPlantillaMalla: dto.idPlantillaMalla },
    });
    if (!plantilla) {
      throw new NotFoundException('La plantilla indicada no existe.');
    }

    const anno = dto.anno.trim();
    const periodo = dto.periodo.trim();
    await this.validarAnnoPeriodoNoDuplicado(dto.idPlantillaMalla, anno, periodo);

    const ahora = new Date();
    const creado = await this.prisma.planEstudio.create({
      data: {
        idplan_estudio: randomUUID(),
        idPlantillaMalla: dto.idPlantillaMalla,
        anno,
        periodo,
        createdAt: ahora,
        updatedAt: ahora,
      },
    });

    return this.toView(creado, []);
  }

  // Los periodos de un plan de estudio solo tienen sentido dentro de UNA
  // malla (ver nota de diseño en DDL.sql): por eso se listan siempre
  // filtrados por plantillaId, nunca "todos".
  async listarPorPlantilla(plantillaId: string): Promise<PlanEstudioView[]> {
    if (!plantillaId) {
      throw new BadRequestException('Debes indicar la plantilla (plantillaId).');
    }

    const planes = await this.prisma.planEstudio.findMany({
      where: { idPlantillaMalla: plantillaId },
      include: { clases: true },
      // Orden de creación: así el admin controla el orden visual (año 1
      // antes que año 2, etc.) simplemente creando los periodos en secuencia,
      // sin depender de que "primer/segundo/tercer año" ordene bien como texto.
      orderBy: { createdAt: 'asc' },
    });

    return planes.map((p) => this.toView(p, p.clases.map((c) => c.idPlantillaMalla_has_Clase)));
  }

  async actualizar(id: string, dto: UpdatePlanEstudioDto): Promise<PlanEstudioView> {
    const actual = await this.obtenerOFallar(id);

    const anno = dto.anno !== undefined ? dto.anno.trim() : (actual.anno ?? '');
    const periodo = dto.periodo !== undefined ? dto.periodo.trim() : (actual.periodo ?? '');
    // Solo se re-valida el duplicado si año o período realmente cambian
    // (igual que PeriodoService.actualizar), y contra la combinación
    // resultante, no solo el campo que llegó en el dto.
    if (dto.anno !== undefined || dto.periodo !== undefined) {
      await this.validarAnnoPeriodoNoDuplicado(actual.idPlantillaMalla, anno, periodo, id);
    }

    if (dto.clasesIds !== undefined) {
      await this.validarClasesDeLaMismaMalla(actual.idPlantillaMalla, dto.clasesIds);
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.anno !== undefined || dto.periodo !== undefined) {
        await tx.planEstudio.update({
          where: { idplan_estudio: id },
          data: { anno, periodo, updatedAt: new Date() },
        });
      }

      if (dto.clasesIds !== undefined) {
        // Se reemplaza la lista completa (igual que el patrón de
        // RequisitoPicker en el front): más simple que exponer altas/bajas
        // individuales y evita quedar desincronizado con lo que el admin ve.
        await tx.planEstudio_has_PlantillaMalla_has_Clase.deleteMany({ where: { idplan_estudio: id } });
        if (dto.clasesIds.length > 0) {
          await tx.planEstudio_has_PlantillaMalla_has_Clase.createMany({
            data: dto.clasesIds.map((idPlantillaMalla_has_Clase) => ({
              idplan_estudio: id,
              idPlantillaMalla_has_Clase,
            })),
          });
        }
      }
    });

    const actualizado = await this.prisma.planEstudio.findUniqueOrThrow({
      where: { idplan_estudio: id },
      include: { clases: true },
    });
    return this.toView(actualizado, actualizado.clases.map((c) => c.idPlantillaMalla_has_Clase));
  }

  async eliminar(id: string): Promise<void> {
    await this.obtenerOFallar(id);

    // FK plan_estudio_has_..._plan_estudio1 usa NoAction (igual que el resto
    // de relaciones "has" del esquema): hay que limpiar el junction a mano
    // antes de poder borrar la fila de plan_estudio.
    await this.prisma.$transaction(async (tx) => {
      await tx.planEstudio_has_PlantillaMalla_has_Clase.deleteMany({ where: { idplan_estudio: id } });
      await tx.planEstudio.delete({ where: { idplan_estudio: id } });
    });
  }

  private async validarAnnoPeriodoNoDuplicado(
    idPlantillaMalla: string,
    anno: string,
    periodo: string,
    excluirId?: string,
  ) {
    // La BD ya tiene UNIQUE(idPlantillaMalla, anno, periodo)
    // (UQ_plan_estudio_malla_anno_periodo); se valida también aquí para
    // devolver un 409 con mensaje claro.
    const existente = await this.prisma.planEstudio.findFirst({
      where: { idPlantillaMalla, anno, periodo, ...(excluirId ? { NOT: { idplan_estudio: excluirId } } : {}) },
    });
    if (existente) {
      throw new ConflictException(`Ya existe un "${periodo}" en "${anno}" para esta plantilla.`);
    }
  }

  private async validarClasesDeLaMismaMalla(idPlantillaMalla: string, clasesIds: string[]) {
    if (clasesIds.length === 0) return;
    const clases = await this.prisma.plantillaMalla_has_Clase.findMany({
      where: { idPlantillaMalla_has_Clase: { in: clasesIds }, idPlantillaMalla },
      select: { idPlantillaMalla_has_Clase: true },
    });
    if (clases.length !== new Set(clasesIds).size) {
      throw new BadRequestException(
        'Una o más clases no existen o no pertenecen a la malla de este plan de estudio.',
      );
    }
  }

  private async obtenerOFallar(id: string) {
    const actual = await this.prisma.planEstudio.findUnique({ where: { idplan_estudio: id } });
    if (!actual) {
      throw new NotFoundException('El periodo del plan de estudio indicado no existe.');
    }
    return actual;
  }

  private toView(
    p: { idplan_estudio: string; idPlantillaMalla: string; anno: string | null; periodo: string | null },
    clasesIds: string[],
  ): PlanEstudioView {
    return {
      id: p.idplan_estudio,
      idPlantillaMalla: p.idPlantillaMalla,
      anno: p.anno ?? '',
      periodo: p.periodo ?? '',
      clasesIds,
    };
  }
}
