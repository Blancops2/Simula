import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ROLE_ID_MAP, Role, TIPO_REQUISITO_APP, TIPO_REQUISITO_DB, TipoClase, TipoRequisito } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/decorators/current-user.decorator';
import { AsignarPlantillaDto } from './dto/asignar-plantilla.dto';
import { CreateCarreraDto } from './dto/create-carrera.dto';
import { CreateClaseDto } from './dto/create-clase.dto';
import { CreatePlantillaDto } from './dto/create-plantilla.dto';
import { CreateRequisitoDto } from './dto/create-requisito.dto';
import { DuplicarPlantillaDto } from './dto/duplicar-plantilla.dto';
import { UpdateClaseDto } from './dto/update-clase.dto';
import { UpdatePlantillaDto } from './dto/update-plantilla.dto';

export interface RequisitoView {
  relacionId: string;
  claseId: string;
  codigo: string;
  nombre: string;
}

export interface ClaseView {
  // Id de la fila PlantillaMalla_has_Clase: identifica la clase DENTRO de
  // esta plantilla/versión concreta (no el id del catálogo compartido Clase).
  id: string;
  claseId: string;
  codigo: string;
  nombre: string;
  unidadesValorativas: number;
  nivel: number;
  tipo: string;
  posX: number | null;
  posY: number | null;
  prerrequisitos: RequisitoView[];
  correquisitos: RequisitoView[];
}

export interface PlantillaArbol {
  id: string;
  nombre: string;
  version: number;
  activa: boolean;
  carreraId: string;
  plantillaOrigenId: string | null;
  niveles: { nivel: number; clases: ClaseView[] }[];
}

// Una "clase dentro de la malla" (PlantillaMalla_has_Clase) más los datos
// del catálogo compartido (Clase), su posición en el canvas (Posicion) y
// sus requisitos. Los requisitos ahora relacionan filas PlantillaMalla_has_Clase
// entre sí (no filas Clase directamente), así que un requisito solo tiene
// sentido dentro de la plantilla donde se definió.
const PLANTILLA_CLASE_INCLUDE = {
  clase: true,
  posicion: true,
  requisitosPropios: { include: { requisito: { include: { clase: true } } } },
} satisfies Prisma.PlantillaMalla_has_ClaseInclude;

type PlantillaClaseConRequisitos = Prisma.PlantillaMalla_has_ClaseGetPayload<{
  include: typeof PLANTILLA_CLASE_INCLUDE;
}>;

@Injectable()
export class CurriculumService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Carreras ----------

  async crearCarrera(dto: CreateCarreraDto) {
    // Carrera.codigo no tiene restricción UNIQUE en la BD real; se valida a
    // nivel de aplicación para conservar la garantía que tenía el esquema anterior.
    const existente = await this.prisma.carrera.findFirst({ where: { codigo: dto.codigo } });
    if (existente) {
      throw new ConflictException('Ya existe una carrera con ese código.');
    }

    const facultad = await this.prisma.facultad.findUnique({ where: { idFacultad: dto.idFacultad } });
    if (!facultad) {
      throw new NotFoundException('La facultad indicada no existe.');
    }

    const carrera = await this.prisma.carrera.create({
      data: {
        idCarrera: randomUUID(),
        nombre: dto.nombre,
        codigo: dto.codigo,
        idFacultad: dto.idFacultad,
      },
    });
    return { id: carrera.idCarrera, nombre: carrera.nombre ?? '', codigo: carrera.codigo ?? '' };
  }

  async listarCarreras() {
    const carreras = await this.prisma.carrera.findMany({ orderBy: { nombre: 'asc' } });
    return carreras.map((c) => ({ id: c.idCarrera, nombre: c.nombre ?? '', codigo: c.codigo ?? '' }));
  }

  // ---------- Plantillas ----------

  async crearPlantilla(dto: CreatePlantillaDto) {
    const carrera = await this.prisma.carrera.findUnique({ where: { idCarrera: dto.carreraId } });
    if (!carrera) {
      throw new NotFoundException('La carrera indicada no existe.');
    }

    const existente = await this.prisma.plantillaMalla.findFirst({
      where: { idCarrera: dto.carreraId, nombre: dto.nombre },
    });
    if (existente) {
      throw new ConflictException('Ya existe una plantilla con ese nombre para esta carrera.');
    }

    // plantillaOrigenId es NOT NULL en la BD real: la primera versión se
    // autorreferencia (ver nota en DML.sql). El id se genera antes del
    // create para poder usarlo también como plantillaOrigenId en el mismo INSERT.
    const id = randomUUID();
    return this.prisma.plantillaMalla.create({
      data: {
        idPlantillaMalla: id,
        idCarrera: dto.carreraId,
        nombre: dto.nombre,
        version: 1,
        activa: true,
        plantillaOrigenId: id,
      },
    });
  }

  async listarPlantillas(carreraId?: string) {
    const plantillas = await this.prisma.plantillaMalla.findMany({
      where: carreraId ? { idCarrera: carreraId } : undefined,
      include: {
        carrera: { select: { idCarrera: true, nombre: true, codigo: true } },
        _count: { select: { clases: true, estudiantes: true } },
      },
      orderBy: [{ idCarrera: 'asc' }, { nombre: 'asc' }, { version: 'desc' }],
    });

    return plantillas.map((p) => ({
      id: p.idPlantillaMalla,
      nombre: p.nombre ?? '',
      version: Number(p.version ?? 1),
      activa: p.activa ?? true,
      carreraId: p.idCarrera,
      plantillaOrigenId: p.plantillaOrigenId,
      carrera: { id: p.carrera.idCarrera, nombre: p.carrera.nombre ?? '', codigo: p.carrera.codigo ?? '' },
      _count: p._count,
    }));
  }

  async obtenerArbol(id: string, currentUser: RequestUser): Promise<PlantillaArbol> {
    const plantilla = await this.prisma.plantillaMalla.findUnique({
      where: { idPlantillaMalla: id },
      include: { clases: { include: PLANTILLA_CLASE_INCLUDE, orderBy: { posicion: { nivel: 'asc' } } } },
    });
    if (!plantilla) {
      throw new NotFoundException('La plantilla indicada no existe.');
    }

    if (currentUser.role === Role.ESTUDIANTE) {
      const asignacion = await this.prisma.plantillaMalla_has_User.findUnique({
        where: { idPlantillaMalla_idUser: { idPlantillaMalla: id, idUser: currentUser.userId } },
      });
      if (!asignacion) {
        throw new ForbiddenException('No tienes acceso a esta plantilla de malla.');
      }
    }

    return this.construirArbol(plantilla);
  }

  async actualizarPlantilla(id: string, dto: UpdatePlantillaDto) {
    await this.obtenerPlantillaOFallar(id);
    return this.prisma.plantillaMalla.update({ where: { idPlantillaMalla: id }, data: dto });
  }

  async eliminarPlantilla(id: string) {
    await this.obtenerPlantillaOFallar(id);

    const estudiantesAsignados = await this.prisma.plantillaMalla_has_User.count({
      where: { idPlantillaMalla: id },
    });
    if (estudiantesAsignados > 0) {
      throw new ConflictException(
        `No se puede eliminar: hay ${estudiantesAsignados} estudiante(s) cursando esta plantilla. Desactívala en su lugar.`,
      );
    }

    // Los FK hacia PlantillaMalla_has_Clase/Requisito usan NoAction (SQL
    // Server no permite varias rutas de cascade), así que hay que limpiar a
    // mano antes de poder borrar la plantilla.
    await this.prisma.$transaction(async (tx) => {
      const clases = await tx.plantillaMalla_has_Clase.findMany({
        where: { idPlantillaMalla: id },
        select: { idPlantillaMalla_has_Clase: true },
      });
      const idsClases = clases.map((c) => c.idPlantillaMalla_has_Clase);

      if (idsClases.length > 0) {
        await tx.requisito.deleteMany({
          where: {
            OR: [
              { idPlantillaMalla_has_Clase: { in: idsClases } },
              { idClaseRequisito: { in: idsClases } },
            ],
          },
        });
        await tx.historialAcademico.deleteMany({
          where: { idPlantillaMalla_has_Clase: { in: idsClases } },
        });
        await tx.plantillaMalla_has_Clase.deleteMany({ where: { idPlantillaMalla: id } });
      }

      await tx.plantillaMalla.delete({ where: { idPlantillaMalla: id } });
    });
  }

  async duplicarPlantilla(id: string, dto: DuplicarPlantillaDto) {
    const original = await this.prisma.plantillaMalla.findUnique({
      where: { idPlantillaMalla: id },
      include: { clases: { include: PLANTILLA_CLASE_INCLUDE } },
    });
    if (!original) {
      throw new NotFoundException('La plantilla indicada no existe.');
    }

    const nuevaId = await this.prisma.$transaction(async (tx) => {
      const nueva = await tx.plantillaMalla.create({
        data: {
          idPlantillaMalla: randomUUID(),
          idCarrera: original.idCarrera,
          nombre: dto.nombre?.trim() || original.nombre || '',
          version: Number(original.version ?? 1) + 1,
          activa: true,
          plantillaOrigenId: original.idPlantillaMalla,
        },
      });

      // El catálogo de Clase se comparte entre plantillas: no se duplica.
      // Solo se duplican la fila de enlace (PlantillaMalla_has_Clase) y su
      // propia Posicion, para que mover un nodo en la copia no mueva el
      // original.
      const idAnteriorANuevo = new Map<string, string>();
      for (const pmc of original.clases) {
        const nuevaPosicion = await tx.posicion.create({
          data: {
            idPosicion: randomUUID(),
            posX: pmc.posicion.posX,
            posY: pmc.posicion.posY,
            nivel: pmc.posicion.nivel,
          },
        });

        const nuevoPmc = await tx.plantillaMalla_has_Clase.create({
          data: {
            idPlantillaMalla_has_Clase: randomUUID(),
            idPlantillaMalla: nueva.idPlantillaMalla,
            idClase: pmc.idClase,
            Posicion_idPosicion: nuevaPosicion.idPosicion,
            obligatoria: pmc.obligatoria,
            estado: pmc.estado,
          },
        });
        idAnteriorANuevo.set(pmc.idPlantillaMalla_has_Clase, nuevoPmc.idPlantillaMalla_has_Clase);
      }

      for (const pmc of original.clases) {
        for (const relacion of pmc.requisitosPropios) {
          const claseId = idAnteriorANuevo.get(pmc.idPlantillaMalla_has_Clase);
          const requisitoId = idAnteriorANuevo.get(relacion.idClaseRequisito);
          if (!claseId || !requisitoId) continue;
          await tx.requisito.create({
            data: {
              idRequisito: randomUUID(),
              idPlantillaMalla_has_Clase: claseId,
              idClaseRequisito: requisitoId,
              tipoRequisito: relacion.tipoRequisito,
            },
          });
        }
      }

      return nueva.idPlantillaMalla;
    });

    const nueva = await this.prisma.plantillaMalla.findUniqueOrThrow({
      where: { idPlantillaMalla: nuevaId },
      include: { clases: { include: PLANTILLA_CLASE_INCLUDE, orderBy: { posicion: { nivel: 'asc' } } } },
    });
    return this.construirArbol(nueva);
  }

  async listarEstudiantes(id: string) {
    await this.obtenerPlantillaOFallar(id);
    const asignaciones = await this.prisma.plantillaMalla_has_User.findMany({
      where: { idPlantillaMalla: id },
      include: { user: { select: { idUser: true, correoInstitucional: true } } },
      orderBy: { user: { correoInstitucional: 'asc' } },
    });
    return asignaciones.map((a) => ({ id: a.user.idUser, email: a.user.correoInstitucional }));
  }

  async asignarEstudiante(userId: string, dto: AsignarPlantillaDto) {
    const [usuario, plantilla] = await Promise.all([
      this.prisma.user.findUnique({ where: { idUser: userId } }),
      this.prisma.plantillaMalla.findUnique({ where: { idPlantillaMalla: dto.plantillaId } }),
    ]);
    if (!usuario || ROLE_ID_MAP[usuario.idRole] !== Role.ESTUDIANTE) {
      throw new NotFoundException('El estudiante indicado no existe.');
    }
    if (!plantilla) {
      throw new NotFoundException('La plantilla indicada no existe.');
    }

    // PlantillaMalla_has_User es muchos-a-muchos en la BD, pero la regla de
    // negocio sigue siendo "un estudiante cursa una sola plantilla a la
    // vez": se reemplaza cualquier asignación previa.
    await this.prisma.$transaction([
      this.prisma.plantillaMalla_has_User.deleteMany({ where: { idUser: userId } }),
      this.prisma.plantillaMalla_has_User.create({
        data: { idPlantillaMalla: dto.plantillaId, idUser: userId, estado: 'activo' },
      }),
    ]);

    return { id: usuario.idUser, email: usuario.correoInstitucional, plantillaMallaId: dto.plantillaId };
  }

  // ---------- Clases ----------

  async agregarClase(plantillaId: string, dto: CreateClaseDto) {
    const plantilla = await this.prisma.plantillaMalla.findUnique({
      where: { idPlantillaMalla: plantillaId },
      include: { carrera: true },
    });
    if (!plantilla) {
      throw new NotFoundException('La plantilla indicada no existe.');
    }

    const yaExiste = await this.prisma.plantillaMalla_has_Clase.findFirst({
      where: { idPlantillaMalla: plantillaId, clase: { codigo: dto.codigo } },
    });
    if (yaExiste) {
      throw new ConflictException(`Ya existe una clase con el código "${dto.codigo}" en esta plantilla.`);
    }

    const nuevoId = await this.prisma.$transaction(async (tx) => {
      // La Clase es un catálogo compartido por Facultad (ver Clase.idFacultad
      // en la BD real): si ya existe una con ese código en la facultad de
      // esta carrera se reutiliza, en vez de duplicar la definición.
      let clase = await tx.clase.findFirst({
        where: { codigo: dto.codigo, idFacultad: plantilla.carrera.idFacultad },
      });
      if (!clase) {
        clase = await tx.clase.create({
          data: {
            idClase: randomUUID(),
            codigo: dto.codigo,
            nombre: dto.nombre,
            unidadesValorativas: dto.unidadesValorativas,
            idFacultad: plantilla.carrera.idFacultad,
          },
        });
      }

      const posicion = await tx.posicion.create({
        data: {
          idPosicion: randomUUID(),
          posX: dto.posX !== undefined ? String(dto.posX) : null,
          posY: dto.posY !== undefined ? String(dto.posY) : null,
          nivel: dto.nivel,
        },
      });

      const pmc = await tx.plantillaMalla_has_Clase.create({
        data: {
          idPlantillaMalla_has_Clase: randomUUID(),
          idPlantillaMalla: plantillaId,
          idClase: clase.idClase,
          Posicion_idPosicion: posicion.idPosicion,
          obligatoria: (dto.tipo ?? TipoClase.OBLIGATORIA) === TipoClase.OBLIGATORIA,
          estado: 'activo',
        },
      });
      return pmc.idPlantillaMalla_has_Clase;
    });

    const pmc = await this.prisma.plantillaMalla_has_Clase.findUniqueOrThrow({
      where: { idPlantillaMalla_has_Clase: nuevoId },
      include: PLANTILLA_CLASE_INCLUDE,
    });
    return this.toClaseView(pmc);
  }

  async actualizarClase(id: string, dto: UpdateClaseDto) {
    const pmc = await this.obtenerClaseOFallar(id);

    await this.prisma.$transaction(async (tx) => {
      // Nota: codigo/nombre/unidadesValorativas viven en el catálogo Clase,
      // compartido entre plantillas. Actualizarlos aquí afecta a todas las
      // plantillas que usan esta misma clase, no solo a esta.
      if (dto.codigo !== undefined || dto.nombre !== undefined || dto.unidadesValorativas !== undefined) {
        await tx.clase.update({
          where: { idClase: pmc.idClase },
          data: {
            ...(dto.codigo !== undefined && { codigo: dto.codigo }),
            ...(dto.nombre !== undefined && { nombre: dto.nombre }),
            ...(dto.unidadesValorativas !== undefined && { unidadesValorativas: dto.unidadesValorativas }),
          },
        });
      }

      if (dto.nivel !== undefined || dto.posX !== undefined || dto.posY !== undefined) {
        await tx.posicion.update({
          where: { idPosicion: pmc.Posicion_idPosicion },
          data: {
            ...(dto.nivel !== undefined && { nivel: dto.nivel }),
            ...(dto.posX !== undefined && { posX: String(dto.posX) }),
            ...(dto.posY !== undefined && { posY: String(dto.posY) }),
          },
        });
      }

      if (dto.tipo !== undefined) {
        await tx.plantillaMalla_has_Clase.update({
          where: { idPlantillaMalla_has_Clase: id },
          data: { obligatoria: dto.tipo === TipoClase.OBLIGATORIA },
        });
      }
    });

    const actualizado = await this.prisma.plantillaMalla_has_Clase.findUniqueOrThrow({
      where: { idPlantillaMalla_has_Clase: id },
      include: PLANTILLA_CLASE_INCLUDE,
    });
    return this.toClaseView(actualizado);
  }

  async eliminarClase(id: string) {
    const pmc = await this.obtenerClaseOFallar(id);

    await this.prisma.$transaction(async (tx) => {
      // El FK Requisito->PlantillaMalla_has_Clase usa NoAction en ambos
      // lados (SQL Server no permite dos rutas de cascade hacia la misma
      // tabla), así que hay que borrar a mano las relaciones donde esta fila
      // participa, en cualquiera de los dos roles.
      await tx.requisito.deleteMany({
        where: { OR: [{ idPlantillaMalla_has_Clase: id }, { idClaseRequisito: id }] },
      });
      await tx.historialAcademico.deleteMany({ where: { idPlantillaMalla_has_Clase: id } });
      await tx.plantillaMalla_has_Clase.delete({ where: { idPlantillaMalla_has_Clase: id } });

      // La Posicion es propia de esta fila salvo que algo más la esté usando
      // (p. ej. el placeholder legado POS-DEFAULT); solo se borra si quedó huérfana.
      const otrosUsandoPosicion = await tx.plantillaMalla_has_Clase.count({
        where: { Posicion_idPosicion: pmc.Posicion_idPosicion },
      });
      if (otrosUsandoPosicion === 0) {
        await tx.posicion.delete({ where: { idPosicion: pmc.Posicion_idPosicion } });
      }
    });
  }

  // ---------- Requisitos (prerrequisitos / correquisitos) ----------

  async agregarRequisito(id: string, dto: CreateRequisitoDto) {
    if (id === dto.requisitoId) {
      throw new BadRequestException('Una clase no puede ser prerrequisito o correquisito de sí misma.');
    }

    const [clase, requisito] = await Promise.all([
      this.obtenerClaseOFallar(id),
      this.obtenerClaseOFallar(dto.requisitoId),
    ]);

    if (clase.idPlantillaMalla !== requisito.idPlantillaMalla) {
      throw new BadRequestException('El requisito debe pertenecer a la misma plantilla que la clase.');
    }

    if (await this.generaCiclo(clase.idPlantillaMalla, id, dto.requisitoId)) {
      throw new BadRequestException('Esta relación generaría un ciclo de dependencias entre clases.');
    }

    // Requisito no tiene restricción UNIQUE en la BD real sobre estas
    // columnas; se valida a nivel de aplicación.
    const yaExiste = await this.prisma.requisito.findFirst({
      where: { idPlantillaMalla_has_Clase: id, idClaseRequisito: dto.requisitoId },
    });
    if (yaExiste) {
      throw new ConflictException('Esa relación ya existe.');
    }

    return this.prisma.requisito.create({
      data: {
        idRequisito: randomUUID(),
        idPlantillaMalla_has_Clase: id,
        idClaseRequisito: dto.requisitoId,
        tipoRequisito: TIPO_REQUISITO_DB[dto.tipo],
      },
    });
  }

  async eliminarRequisito(relacionId: string) {
    const relacion = await this.prisma.requisito.findUnique({ where: { idRequisito: relacionId } });
    if (!relacion) {
      throw new NotFoundException('La relación indicada no existe.');
    }
    await this.prisma.requisito.delete({ where: { idRequisito: relacionId } });
  }

  // ---------- Helpers ----------

  private async obtenerPlantillaOFallar(id: string) {
    const plantilla = await this.prisma.plantillaMalla.findUnique({ where: { idPlantillaMalla: id } });
    if (!plantilla) {
      throw new NotFoundException('La plantilla indicada no existe.');
    }
    return plantilla;
  }

  private async obtenerClaseOFallar(id: string) {
    const pmc = await this.prisma.plantillaMalla_has_Clase.findUnique({
      where: { idPlantillaMalla_has_Clase: id },
    });
    if (!pmc) {
      throw new NotFoundException('La clase indicada no existe.');
    }
    return pmc;
  }

  /**
   * Determina si agregar la arista claseId -> requisitoId cerraría un ciclo,
   * es decir, si requisitoId ya depende (directa o transitivamente) de claseId.
   * Los nodos son ids de PlantillaMalla_has_Clase (clase dentro de la malla).
   */
  private async generaCiclo(
    plantillaId: string,
    claseId: string,
    requisitoId: string,
  ): Promise<boolean> {
    const relaciones = await this.prisma.requisito.findMany({
      where: { clase: { idPlantillaMalla: plantillaId } },
      select: { idPlantillaMalla_has_Clase: true, idClaseRequisito: true },
    });

    const adyacencia = new Map<string, string[]>();
    for (const { idPlantillaMalla_has_Clase: origen, idClaseRequisito: destino } of relaciones) {
      const vecinos = adyacencia.get(origen) ?? [];
      vecinos.push(destino);
      adyacencia.set(origen, vecinos);
    }

    const visitados = new Set<string>();
    const pila = [requisitoId];
    while (pila.length > 0) {
      const actual = pila.pop()!;
      if (actual === claseId) return true;
      if (visitados.has(actual)) continue;
      visitados.add(actual);
      for (const vecino of adyacencia.get(actual) ?? []) {
        pila.push(vecino);
      }
    }
    return false;
  }

  private toClaseView(pmc: PlantillaClaseConRequisitos): ClaseView {
    const tipo = pmc.obligatoria === false ? TipoClase.ELECTIVA : TipoClase.OBLIGATORIA;

    return {
      id: pmc.idPlantillaMalla_has_Clase,
      claseId: pmc.idClase,
      codigo: pmc.clase.codigo ?? '',
      nombre: pmc.clase.nombre ?? '',
      unidadesValorativas: pmc.clase.unidadesValorativas ?? 0,
      nivel: pmc.posicion.nivel ?? 0,
      tipo,
      posX: pmc.posicion.posX !== null ? Number(pmc.posicion.posX) : null,
      posY: pmc.posicion.posY !== null ? Number(pmc.posicion.posY) : null,
      prerrequisitos: pmc.requisitosPropios
        .filter((r) => TIPO_REQUISITO_APP[r.tipoRequisito ?? ''] === TipoRequisito.PRERREQUISITO)
        .map((r) => ({
          relacionId: r.idRequisito,
          claseId: r.requisito.idPlantillaMalla_has_Clase,
          codigo: r.requisito.clase.codigo ?? '',
          nombre: r.requisito.clase.nombre ?? '',
        })),
      correquisitos: pmc.requisitosPropios
        .filter((r) => TIPO_REQUISITO_APP[r.tipoRequisito ?? ''] === TipoRequisito.CORREQUISITO)
        .map((r) => ({
          relacionId: r.idRequisito,
          claseId: r.requisito.idPlantillaMalla_has_Clase,
          codigo: r.requisito.clase.codigo ?? '',
          nombre: r.requisito.clase.nombre ?? '',
        })),
    };
  }

  private construirArbol(
    plantilla: Prisma.PlantillaMallaGetPayload<{
      include: { clases: { include: typeof PLANTILLA_CLASE_INCLUDE } };
    }>,
  ): PlantillaArbol {
    const porNivel = new Map<number, ClaseView[]>();
    for (const pmc of plantilla.clases) {
      const view = this.toClaseView(pmc);
      const lista = porNivel.get(view.nivel) ?? [];
      lista.push(view);
      porNivel.set(view.nivel, lista);
    }

    const niveles = [...porNivel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([nivel, clases]) => ({ nivel, clases }));

    return {
      id: plantilla.idPlantillaMalla,
      nombre: plantilla.nombre ?? '',
      version: Number(plantilla.version ?? 1),
      activa: plantilla.activa ?? true,
      carreraId: plantilla.idCarrera,
      plantillaOrigenId: plantilla.plantillaOrigenId,
      niveles,
    };
  }
}
