import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  EstadoHistorial,
  OrigenHistorial,
  ROLE_ID_MAP,
  Role,
  TIPO_REQUISITO_APP,
  TipoClase,
  TipoRequisito,
} from '../common/enums';
import { RequestUser } from '../auth/decorators/current-user.decorator';
import { CurriculumService, ClaseView, PlantillaArbol, RequisitoView } from '../curriculum/curriculum.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarPerfilEstudianteDto } from './dto/actualizar-perfil-estudiante.dto';
import { RegistrarDetalleClaseDto } from './dto/registrar-detalle-clase.dto';
import { RegistrarHistorialDto } from './dto/registrar-historial.dto';
import { periodoActual, periodoCombinado } from './periodo.util';

export type EstadoClaseEstudiante = 'APROBADA' | 'EN_CURSO' | 'DISPONIBLE' | 'BLOQUEADA';

export interface ClaseConEstado extends ClaseView {
  estadoEstudiante: EstadoClaseEstudiante;
  prerrequisitosFaltantes: RequisitoView[];
}

export interface MallaConEstado {
  plantilla: Pick<PlantillaArbol, 'id' | 'nombre' | 'version' | 'activa' | 'carreraId'>;
  niveles: { nivel: number; clases: ClaseConEstado[] }[];
}

export interface AvanceAcademico {
  unidadesValorativasAprobadas: number;
  unidadesValorativasTotalesObligatorias: number;
  unidadesValorativasAprobadasObligatorias: number;
  porcentajeMallaCompletada: number;
}

export interface ClasePensum extends ClaseView {
  cursada: boolean;
  oficial: boolean;
  autorreportada: boolean;
  periodo: string | null;
  anno: string | null;
  nota: string | null;
}

export interface PensumArbol {
  plantilla: Pick<PlantillaArbol, 'id' | 'nombre' | 'version' | 'activa' | 'carreraId'>;
  niveles: { nivel: number; clases: ClasePensum[] }[];
}

@Injectable()
export class EstudianteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly curriculum: CurriculumService,
  ) {}

  // ---------- Perfil ----------

  async obtenerPerfil(userId: string, currentUser: RequestUser) {
    const user = await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);

    const malla = plantillaId
      ? await this.construirMallaConEstado(plantillaId, userId, currentUser)
      : null;

    return {
      id: user.idUser,
      email: user.correoInstitucional,
      nombreCompleto: user.NombreCompleto,
      codigoEstudiantil: user.codigoInstitucional,
      carrera: malla
        ? await this.prisma.carrera
            .findUnique({ where: { idCarrera: malla.plantilla.carreraId } })
            .then((c) => (c ? { id: c.idCarrera, nombre: c.nombre, codigo: c.codigo } : null))
        : null,
      plantilla: malla?.plantilla ?? null,
      semestreSugerido: malla ? this.calcularSemestreSugerido(malla) : 1,
      avance: malla
        ? this.calcularAvance(malla)
        : {
            unidadesValorativasAprobadas: 0,
            unidadesValorativasTotalesObligatorias: 0,
            unidadesValorativasAprobadasObligatorias: 0,
            porcentajeMallaCompletada: 0,
          },
    };
  }

  async actualizarPerfil(userId: string, dto: ActualizarPerfilEstudianteDto) {
    await this.obtenerEstudianteOFallar(userId);

    // codigoInstitucional no tiene restricción UNIQUE en la BD real; se
    // valida a nivel de aplicación para conservar la garantía del esquema anterior.
    if (dto.codigoEstudiantil !== undefined) {
      const enUso = await this.prisma.user.findFirst({
        where: { codigoInstitucional: dto.codigoEstudiantil, idUser: { not: userId } },
      });
      if (enUso) {
        throw new ConflictException('Ese código estudiantil ya está en uso.');
      }
    }

    return this.prisma.user.update({
      where: { idUser: userId },
      data: {
        ...(dto.nombreCompleto !== undefined && { NombreCompleto: dto.nombreCompleto }),
        ...(dto.codigoEstudiantil !== undefined && { codigoInstitucional: dto.codigoEstudiantil }),
      },
      select: { idUser: true, correoInstitucional: true, NombreCompleto: true, codigoInstitucional: true },
    });
  }

  // ---------- Malla con estado (solo lectura de la plantilla del admin) ----------

  async obtenerMalla(userId: string, currentUser: RequestUser): Promise<MallaConEstado> {
    await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);
    if (!plantillaId) {
      throw new NotFoundException('Aún no tienes una plantilla de malla curricular asignada.');
    }
    return this.construirMallaConEstado(plantillaId, userId, currentUser);
  }

  private async construirMallaConEstado(
    plantillaId: string,
    userId: string,
    currentUser: RequestUser,
  ): Promise<MallaConEstado> {
    // Solo lectura: se reutiliza tal cual la construcción de árbol + permisos
    // del módulo de administrador. Este módulo nunca escribe sobre la plantilla.
    const arbol = await this.curriculum.obtenerArbol(plantillaId, currentUser);

    // El cruce con el historial se hace por CÓDIGO de clase (catálogo
    // compartido), no por idPlantillaMalla_has_Clase, y sobre TODO el
    // historial del estudiante: así, si un admin reasigna al estudiante a
    // una versión nueva de la malla, las materias ya aprobadas en la
    // versión anterior (mismo código) siguen contando como aprobadas.
    const historial = await this.prisma.historialAcademico.findMany({
      where: { idUser: userId },
      include: { plantillaMallaClase: { include: { clase: true } } },
    });

    const aprobadasCodigos = new Set(
      historial
        .filter((h) => h.estado === EstadoHistorial.APROBADA)
        .map((h) => h.plantillaMallaClase.clase.codigo),
    );
    const enCursoCodigos = new Set(
      historial
        .filter(
          (h) => h.estado === EstadoHistorial.EN_CURSO && !aprobadasCodigos.has(h.plantillaMallaClase.clase.codigo),
        )
        .map((h) => h.plantillaMallaClase.clase.codigo),
    );

    const niveles = arbol.niveles.map((nivel) => ({
      nivel: nivel.nivel,
      clases: nivel.clases.map((clase): ClaseConEstado => {
        if (aprobadasCodigos.has(clase.codigo)) {
          return { ...clase, estadoEstudiante: 'APROBADA', prerrequisitosFaltantes: [] };
        }
        if (enCursoCodigos.has(clase.codigo)) {
          return { ...clase, estadoEstudiante: 'EN_CURSO', prerrequisitosFaltantes: [] };
        }
        const faltantes = clase.prerrequisitos.filter((p) => !aprobadasCodigos.has(p.codigo));
        return {
          ...clase,
          estadoEstudiante: faltantes.length === 0 ? 'DISPONIBLE' : 'BLOQUEADA',
          prerrequisitosFaltantes: faltantes,
        };
      }),
    }));

    return {
      plantilla: {
        id: arbol.id,
        nombre: arbol.nombre,
        version: arbol.version,
        activa: arbol.activa,
        carreraId: arbol.carreraId,
      },
      niveles,
    };
  }

  private calcularAvance(malla: MallaConEstado): AvanceAcademico {
    const todas = malla.niveles.flatMap((n) => n.clases);
    const obligatorias = todas.filter((c) => c.tipo === TipoClase.OBLIGATORIA);
    const aprobadas = todas.filter((c) => c.estadoEstudiante === 'APROBADA');
    const aprobadasObligatorias = obligatorias.filter((c) => c.estadoEstudiante === 'APROBADA');

    const unidadesValorativasTotalesObligatorias = obligatorias.reduce(
      (sum, c) => sum + c.unidadesValorativas,
      0,
    );
    const unidadesValorativasAprobadasObligatorias = aprobadasObligatorias.reduce(
      (sum, c) => sum + c.unidadesValorativas,
      0,
    );

    return {
      unidadesValorativasAprobadas: aprobadas.reduce((sum, c) => sum + c.unidadesValorativas, 0),
      unidadesValorativasTotalesObligatorias,
      unidadesValorativasAprobadasObligatorias,
      porcentajeMallaCompletada:
        unidadesValorativasTotalesObligatorias > 0
          ? Math.round(
              (unidadesValorativasAprobadasObligatorias / unidadesValorativasTotalesObligatorias) * 100,
            )
          : 0,
    };
  }

  private calcularSemestreSugerido(malla: MallaConEstado): number {
    const nivelesAprobados = malla.niveles
      .flatMap((n) => n.clases)
      .filter((c) => c.tipo === TipoClase.OBLIGATORIA && c.estadoEstudiante === 'APROBADA')
      .map((c) => c.nivel);
    return nivelesAprobados.length > 0 ? Math.max(...nivelesAprobados) + 1 : 1;
  }

  // ---------- Pensum (solo lectura + autorreporte de clases cursadas) ----------
  //
  // El autorreporte escribe directamente en el historial académico oficial
  // (con origen AUTOREPORTE, estado APROBADA): cuenta igual que un registro
  // de administrador para el avance académico y para habilitar los
  // prerrequisitos de inscripción. Lo único que lo distingue es que el
  // propio estudiante puede desmarcarlo (borrar su fila AUTOREPORTE); nunca
  // puede tocar un registro de origen ADMIN desde el pensum.

  async obtenerPensum(userId: string, currentUser: RequestUser): Promise<PensumArbol> {
    await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);
    if (!plantillaId) {
      throw new NotFoundException('Aún no tienes una plantilla de malla curricular asignada.');
    }

    // Solo lectura: se reutiliza tal cual la construcción de árbol del
    // módulo de administrador, igual que en la malla con estado.
    const arbol = await this.curriculum.obtenerArbol(plantillaId, currentUser);

    // Igual que en la malla con estado, el cruce es por CÓDIGO de clase (no
    // por id), para que siga contando tras un cambio de versión de plantilla.
    const historialAprobado = await this.prisma.historialAcademico.findMany({
      where: { idUser: userId, estado: EstadoHistorial.APROBADA },
      include: { plantillaMallaClase: { include: { clase: true } } },
    });

    const historialPorCodigo = new Map<
      string,
      { origen: OrigenHistorial; periodo: string | null; anno: string | null; nota: string | null }
    >();
    for (const h of historialAprobado) {
      const codigo = h.plantillaMallaClase.clase.codigo;
      if (!codigo) continue;
      // Si ya hay un registro ADMIN para ese código, prevalece sobre uno
      // AUTOREPORTE: una aprobación oficial nunca queda "editable".
      if (historialPorCodigo.get(codigo)?.origen !== OrigenHistorial.ADMIN) {
        historialPorCodigo.set(codigo, {
          origen: (h.origen as OrigenHistorial) ?? OrigenHistorial.ADMIN,
          periodo: h.periodo,
          anno: h.anno,
          nota: h.nota,
        });
      }
    }

    const niveles = arbol.niveles.map((nivel) => ({
      nivel: nivel.nivel,
      clases: nivel.clases.map((clase): ClasePensum => {
        const detalle = historialPorCodigo.get(clase.codigo);
        return {
          ...clase,
          cursada: detalle !== undefined,
          oficial: detalle?.origen === OrigenHistorial.ADMIN,
          autorreportada: detalle?.origen === OrigenHistorial.AUTOREPORTE,
          periodo: detalle?.periodo ?? null,
          anno: detalle?.anno ?? null,
          nota: detalle?.nota ?? null,
        };
      }),
    }));

    return {
      plantilla: {
        id: arbol.id,
        nombre: arbol.nombre,
        version: arbol.version,
        activa: arbol.activa,
        carreraId: arbol.carreraId,
      },
      niveles,
    };
  }

  async marcarClaseCursada(userId: string, claseId: string, detalle?: RegistrarDetalleClaseDto) {
    await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);

    const pmc = await this.prisma.plantillaMalla_has_Clase.findUnique({
      where: { idPlantillaMalla_has_Clase: claseId },
    });
    if (!pmc || pmc.idPlantillaMalla !== plantillaId) {
      throw new NotFoundException('La clase indicada no pertenece a tu malla curricular.');
    }

    // Un solo registro de autorreporte por clase (igual que asume
    // desmarcarClaseCursada, que borra por origen sin filtrar periodo): así
    // completar el modal de detalle después de tildar el checkbox actualiza
    // la misma fila en vez de crear una duplicada.
    const admin = await this.prisma.historialAcademico.findFirst({
      where: { idUser: userId, idPlantillaMalla_has_Clase: claseId, origen: OrigenHistorial.ADMIN },
    });
    if (admin) {
      // Ya hay un registro oficial de administrador para esta clase: no se
      // sobrescribe desde el autorreporte.
      return;
    }

    const existente = await this.prisma.historialAcademico.findFirst({
      where: { idUser: userId, idPlantillaMalla_has_Clase: claseId, origen: OrigenHistorial.AUTOREPORTE },
    });

    // El período combinado "AAAA-P" solo se puede construir cuando el
    // detalle trae ambos datos; el modal siempre los envía juntos.
    const periodoDetalle =
      detalle?.periodo !== undefined && detalle?.anno !== undefined
        ? periodoCombinado(detalle.periodo, detalle.anno)
        : undefined;

    if (existente) {
      await this.prisma.historialAcademico.update({
        where: { idHistorialAcademico: existente.idHistorialAcademico },
        data: {
          estado: EstadoHistorial.APROBADA,
          ...(periodoDetalle !== undefined && { periodo: periodoDetalle }),
          ...(detalle?.anno !== undefined && { anno: String(detalle.anno) }),
          ...(detalle?.nota !== undefined && { nota: String(detalle.nota) }),
        },
      });
    } else {
      await this.prisma.historialAcademico.create({
        data: {
          idHistorialAcademico: randomUUID(),
          idUser: userId,
          idPlantillaMalla_has_Clase: claseId,
          periodo: periodoDetalle ?? periodoActual(),
          anno: detalle?.anno !== undefined ? String(detalle.anno) : String(new Date().getFullYear()),
          nota: detalle?.nota !== undefined ? String(detalle.nota) : null,
          estado: EstadoHistorial.APROBADA,
          origen: OrigenHistorial.AUTOREPORTE,
        },
      });
    }
  }

  async desmarcarClaseCursada(userId: string, claseId: string) {
    await this.obtenerEstudianteOFallar(userId);
    // deleteMany (no delete) porque puede haber quedado más de una fila
    // AUTOREPORTE para la misma clase en distintos períodos.
    await this.prisma.historialAcademico.deleteMany({
      where: { idUser: userId, idPlantillaMalla_has_Clase: claseId, origen: OrigenHistorial.AUTOREPORTE },
    });
  }

  // ---------- Historial académico ----------

  async obtenerHistorial(userId: string) {
    await this.obtenerEstudianteOFallar(userId);
    const historial = await this.prisma.historialAcademico.findMany({
      where: { idUser: userId },
      include: { plantillaMallaClase: { include: { clase: true, posicion: true } } },
      orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }],
    });
    return historial.map((h) => ({
      id: h.idHistorialAcademico,
      periodo: h.periodo,
      anno: h.anno,
      estado: h.estado,
      nota: h.nota,
      clase: {
        codigo: h.plantillaMallaClase.clase.codigo,
        nombre: h.plantillaMallaClase.clase.nombre,
        unidadesValorativas: h.plantillaMallaClase.clase.unidadesValorativas,
        nivel: h.plantillaMallaClase.posicion.nivel,
      },
    }));
  }

  async registrarHistorial(userId: string, dto: RegistrarHistorialDto) {
    await this.obtenerEstudianteOFallar(userId);
    const pmc = await this.prisma.plantillaMalla_has_Clase.findUnique({
      where: { idPlantillaMalla_has_Clase: dto.claseId },
    });
    if (!pmc) {
      throw new NotFoundException('La clase indicada no existe.');
    }

    const nota = dto.nota !== undefined ? String(dto.nota) : null;
    const existente = await this.prisma.historialAcademico.findFirst({
      where: { idUser: userId, idPlantillaMalla_has_Clase: dto.claseId, periodo: dto.periodo },
    });

    if (existente) {
      return this.prisma.historialAcademico.update({
        where: { idHistorialAcademico: existente.idHistorialAcademico },
        data: { estado: dto.estado, nota },
      });
    }

    return this.prisma.historialAcademico.create({
      data: {
        idHistorialAcademico: randomUUID(),
        idUser: userId,
        idPlantillaMalla_has_Clase: dto.claseId,
        periodo: dto.periodo,
        estado: dto.estado,
        nota,
        origen: OrigenHistorial.ADMIN,
      },
    });
  }

  async eliminarHistorial(userId: string, historialId: string) {
    const registro = await this.prisma.historialAcademico.findUnique({
      where: { idHistorialAcademico: historialId },
    });
    if (!registro || registro.idUser !== userId) {
      throw new NotFoundException('El registro de historial indicado no existe.');
    }
    await this.prisma.historialAcademico.delete({ where: { idHistorialAcademico: historialId } });
  }

  // ---------- Inscripción a clases del período actual ----------

  async inscribir(userId: string, claseIds: string[], currentUser: RequestUser) {
    await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);
    if (!plantillaId) {
      throw new BadRequestException('No tienes una plantilla de malla curricular asignada.');
    }

    const idsUnicos = [...new Set(claseIds)];
    const clases = await this.prisma.plantillaMalla_has_Clase.findMany({
      where: { idPlantillaMalla_has_Clase: { in: idsUnicos }, idPlantillaMalla: plantillaId },
      include: { clase: true, requisitosPropios: { include: { requisito: { include: { clase: true } } } } },
    });
    if (clases.length !== idsUnicos.length) {
      throw new BadRequestException('Alguna clase seleccionada no pertenece a tu plantilla de malla.');
    }

    const malla = await this.construirMallaConEstado(plantillaId, userId, currentUser);
    const estadoPorClaseId = new Map(
      malla.niveles.flatMap((n) => n.clases).map((c) => [c.id, c] as const),
    );

    const periodo = periodoActual();
    const yaInscritas = await this.prisma.inscripcion.findMany({
      where: { idUser: userId, periodo },
      include: { plantillaMallaClase: { include: { clase: true } } },
    });
    const yaInscritasCodigos = new Set(yaInscritas.map((i) => i.plantillaMallaClase.clase.codigo));
    const seleccionCodigos = new Set(clases.map((c) => c.clase.codigo));

    for (const pmc of clases) {
      const codigo = pmc.clase.codigo ?? '';
      const nombre = pmc.clase.nombre ?? '';
      const estado = estadoPorClaseId.get(pmc.idPlantillaMalla_has_Clase);
      if (!estado || estado.estadoEstudiante === 'APROBADA') {
        throw new BadRequestException(`Ya aprobaste ${codigo} - ${nombre}.`);
      }
      if (estado.estadoEstudiante === 'EN_CURSO' || yaInscritasCodigos.has(codigo)) {
        throw new BadRequestException(`Ya estás cursando o inscrito en ${codigo} - ${nombre}.`);
      }
      if (estado.estadoEstudiante === 'BLOQUEADA') {
        const faltantes = estado.prerrequisitosFaltantes.map((r) => r.codigo).join(', ');
        throw new BadRequestException(`No cumples los prerrequisitos de ${codigo}: ${faltantes}.`);
      }

      const correqsFaltantes = pmc.requisitosPropios
        .filter((r) => TIPO_REQUISITO_APP[r.tipoRequisito ?? ''] === TipoRequisito.CORREQUISITO)
        .filter((r) => {
          const reqCodigo = r.requisito.clase.codigo ?? '';
          return (
            !seleccionCodigos.has(reqCodigo) &&
            !yaInscritasCodigos.has(reqCodigo) &&
            estadoPorClaseId.get(r.requisito.idPlantillaMalla_has_Clase)?.estadoEstudiante !== 'APROBADA'
          );
        });
      if (correqsFaltantes.length > 0) {
        const faltantes = correqsFaltantes.map((r) => r.requisito.clase.codigo).join(', ');
        throw new BadRequestException(`${codigo} requiere cursar simultáneamente: ${faltantes}.`);
      }
    }

    // SQL Server no soporta `skipDuplicates` en createMany (a diferencia de
    // Postgres); las validaciones de arriba ya impiden duplicados en el
    // camino normal, así que solo absorbemos un posible choque de
    // concurrencia (doble submit) contra el índice único (idUser, idPlantillaMalla_has_Clase, periodo).
    try {
      await this.prisma.inscripcion.createMany({
        data: clases.map((c) => ({
          idInscripcion: randomUUID(),
          idUser: userId,
          idPlantillaMalla_has_Clase: c.idPlantillaMalla_has_Clase,
          periodo,
        })),
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }

    return this.listarInscripciones(userId, periodo);
  }

  async listarInscripciones(userId: string, periodo: string = periodoActual()) {
    await this.obtenerEstudianteOFallar(userId);
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { idUser: userId, periodo },
      include: { plantillaMallaClase: { include: { clase: true, posicion: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return inscripciones.map((i) => ({
      id: i.idInscripcion,
      periodo: i.periodo,
      clase: {
        id: i.plantillaMallaClase.idPlantillaMalla_has_Clase,
        codigo: i.plantillaMallaClase.clase.codigo,
        nombre: i.plantillaMallaClase.clase.nombre,
        unidadesValorativas: i.plantillaMallaClase.clase.unidadesValorativas,
        nivel: i.plantillaMallaClase.posicion.nivel,
        tipo: i.plantillaMallaClase.obligatoria === false ? TipoClase.ELECTIVA : TipoClase.OBLIGATORIA,
      },
    }));
  }

  async cancelarInscripcion(userId: string, inscripcionId: string) {
    const inscripcion = await this.prisma.inscripcion.findUnique({ where: { idInscripcion: inscripcionId } });
    if (!inscripcion || inscripcion.idUser !== userId) {
      throw new NotFoundException('La inscripción indicada no existe.');
    }
    await this.prisma.inscripcion.delete({ where: { idInscripcion: inscripcionId } });
  }

  // ---------- Helpers ----------

  private async obtenerEstudianteOFallar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { idUser: userId } });
    if (!user || ROLE_ID_MAP[user.idRole] !== Role.ESTUDIANTE) {
      throw new NotFoundException('El estudiante indicado no existe.');
    }
    return user;
  }

  // PlantillaMalla_has_User es muchos-a-muchos en la BD real, pero la regla
  // de negocio (ver curriculum.service.ts#asignarEstudiante) es "una
  // plantilla a la vez": basta con la primera fila que aparezca.
  private async obtenerPlantillaAsignada(userId: string): Promise<string | null> {
    const asignacion = await this.prisma.plantillaMalla_has_User.findFirst({
      where: { idUser: userId },
    });
    return asignacion?.idPlantillaMalla ?? null;
  }
}
