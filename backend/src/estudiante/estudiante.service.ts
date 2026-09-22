import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  EstadoHistorial,
  EstadoPeriodo,
  OrigenHistorial,
  ROLE_ID_MAP,
  Role,
  TIPO_REQUISITO_APP,
  TipoClase,
  TipoRequisito,
} from '../common/enums';
import { RequestUser } from '../auth/decorators/current-user.decorator';
import { CurriculumService, ClaseView, PlantillaArbol, RequisitoView } from '../curriculum/curriculum.service';
import { PeriodoService, PeriodoView } from '../periodo/periodo.service';
import { PlanEstudioService } from '../plan-estudio/plan-estudio.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarPerfilEstudianteDto } from './dto/actualizar-perfil-estudiante.dto';
import { ModeloPredictivoService } from './modelo-predictivo.service';
import { RegistrarHistorialDto } from './dto/registrar-historial.dto';
import { semestreActual } from './periodo.util';

// Umbral (escala 0-100) que usa importarHistorialCsv para derivar
// APROBADA/REPROBADA a partir de la nota, en vez de pedirle ese dato al
// estudiante en el CSV (decisión de negocio, no viene de ninguna tabla).
const NOTA_MINIMA_APROBACION = 65;

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
  enCurso: boolean;
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

export type PlanEstudioPeriodoConEstado = { id: string; anno: string; periodo: string; clases: ClaseConEstado[] };

export interface ResultadoImportacionHistorial {
  totalFilas: number;
  registrados: number;
  omitidos: number;
  errores: string[];
}

export interface RecomendacionClases {
  disponible: boolean;
  fuente: 'MODELO_EXTERNO' | 'FALLBACK_LOCAL' | null;
  clases: ClaseConEstado[];
}

export interface RecomendacionPeriodo {
  periodo: PlanEstudioPeriodoConEstado | null;
  completado: boolean;
}

@Injectable()
export class EstudianteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly curriculum: CurriculumService,
    private readonly periodoService: PeriodoService,
    private readonly planEstudioService: PlanEstudioService,
    private readonly modeloPredictivo: ModeloPredictivoService,
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

  // Plan de estudio recomendado (solo lectura para el estudiante, ver
  // PlanEstudioService/DDL.sql): los mismos periodos que administra el
  // admin para la malla asignada, con cada clase cruzada con el historial
  // del estudiante (aprobada/en curso/disponible/bloqueada) igual que
  // obtenerMalla, para poder resaltar lo ya cursado.
  async obtenerPlanEstudio(userId: string, currentUser: RequestUser): Promise<PlanEstudioPeriodoConEstado[]> {
    await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);
    if (!plantillaId) {
      throw new NotFoundException('Aún no tienes una plantilla de malla curricular asignada.');
    }
    return this.construirPlanEstudioConEstado(plantillaId, userId, currentUser);
  }

  // Compartido entre obtenerPlanEstudio (HU visible hoy) y
  // obtenerRecomendacionPeriodo (HU-04-01): los periodos de plan_estudio de
  // la malla asignada, cada uno con sus clases cruzadas con el historial del
  // estudiante (mismo estado que usa la malla/catálogo).
  private async construirPlanEstudioConEstado(
    plantillaId: string,
    userId: string,
    currentUser: RequestUser,
  ): Promise<PlanEstudioPeriodoConEstado[]> {
    const [malla, periodos] = await Promise.all([
      this.construirMallaConEstado(plantillaId, userId, currentUser),
      this.planEstudioService.listarPorPlantilla(plantillaId),
    ]);

    const clasesPorId = new Map(malla.niveles.flatMap((n) => n.clases).map((c) => [c.id, c]));

    return periodos.map((p) => ({
      id: p.id,
      anno: p.anno,
      periodo: p.periodo,
      clases: p.clasesIds.map((id) => clasesPorId.get(id)).filter((c): c is ClaseConEstado => !!c),
    }));
  }

  // ---------- Recomendaciones (HU-04-01) ----------

  // Recomendación 1: clases sugeridas por un modelo predictivo externo (fuera
  // de nuestro alcance). Si no hay modelo configurado, el adaptador usa un
  // fallback local basado en el nivel sugerido; si el modelo está
  // configurado pero falla, se reporta `disponible: false` en vez de
  // disfrazar el fallback como una recomendación real.
  async obtenerRecomendacionClases(userId: string, currentUser: RequestUser): Promise<RecomendacionClases> {
    const user = await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);
    if (!plantillaId) {
      throw new NotFoundException('Aún no tienes una plantilla de malla curricular asignada.');
    }

    const malla = await this.construirMallaConEstado(plantillaId, userId, currentUser);
    const todasLasClases = malla.niveles.flatMap((n) => n.clases);
    const nivelSugerido = this.calcularSemestreSugerido(malla);
    const codigosAprobados = todasLasClases
      .filter((c) => c.estadoEstudiante === 'APROBADA')
      .map((c) => c.codigo);

    const resultado = await this.modeloPredictivo.obtenerCodigosRecomendados(
      { codigoEstudiantil: user.codigoInstitucional, codigosAprobados, nivelSugerido },
      () =>
        todasLasClases
          .filter((c) => c.estadoEstudiante === 'DISPONIBLE' && c.nivel === nivelSugerido)
          .map((c) => c.codigo),
    );

    if (!resultado) {
      return { disponible: false, fuente: null, clases: [] };
    }

    const codigosRecomendados = new Set(resultado.codigos);
    const clases = todasLasClases.filter(
      (c) => c.estadoEstudiante === 'DISPONIBLE' && codigosRecomendados.has(c.codigo),
    );
    return { disponible: true, fuente: resultado.fuente, clases };
  }

  // Recomendación 2: el periodo de plan_estudio (secuencia recomendada de la
  // malla, ver DDL.sql) cuyas clases el estudiante tiene más avanzadas sin
  // haberlo completado todavía. La elección es SECUENCIAL, no por mayor
  // ratio global: se recorre en el orden ya establecido (mismo orden que
  // PlanEstudioService.listarPorPlantilla) y se devuelve el PRIMER periodo
  // que no esté 100% aprobado. No se compara el ratio entre periodos
  // distintos para elegir cuál recomendar — un periodo posterior con más
  // clases aprobadas en términos relativos (p. ej. por tener menos clases en
  // total) no puede "adelantarse" a un periodo anterior todavía incompleto.
  // Si todos los periodos con clases están 100% aprobados, se reporta el
  // último como "sugerido" y `completado: true`.
  async obtenerRecomendacionPeriodo(userId: string, currentUser: RequestUser): Promise<RecomendacionPeriodo> {
    await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);
    if (!plantillaId) {
      throw new NotFoundException('Aún no tienes una plantilla de malla curricular asignada.');
    }

    const periodos = (await this.construirPlanEstudioConEstado(plantillaId, userId, currentUser)).filter(
      (p) => p.clases.length > 0,
    );
    if (periodos.length === 0) {
      return { periodo: null, completado: true };
    }

    for (const p of periodos) {
      const aprobadas = p.clases.filter((c) => c.estadoEstudiante === 'APROBADA').length;
      if (aprobadas < p.clases.length) {
        return { periodo: p, completado: false };
      }
    }

    return { periodo: periodos[periodos.length - 1], completado: true };
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

  // ---------- Períodos académicos habilitados (para elegir al matricular) ----------
  //
  // El estudiante ve y selecciona las clases (obtenerMalla) sin necesidad de
  // elegir período primero: el período solo importa en el momento de
  // matricular (inscribir), no para navegar/seleccionar clases.

  async obtenerPeriodosDisponibles(): Promise<PeriodoView[]> {
    return this.periodoService.listarHabilitados();
  }

  // ---------- Pensum (solo lectura, salvo el autorreporte de "en curso") ----------
  //
  // El Pensum es una vista puramente visual del avance del estudiante: el
  // historial en sí (aprobada/reprobada, con nota) ya no se edita desde
  // aquí, se sube por CSV (ver importarHistorialCsv) o lo carga el
  // administrador. Lo único que el estudiante sigue pudiendo autorreportar
  // desde el Pensum es "estoy cursando esto ahora" (EN_CURSO), porque el CSV
  // no acepta ese estado (no tiene nota final todavía) — ver
  // marcarClaseEnCurso/desmarcarClaseEnCurso más abajo.

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
    // Se trae TODO el historial (no solo APROBADA) porque ahora también hay
    // que resolver el color "en curso" (gris) a partir del mismo dataset.
    const historialTodo = await this.prisma.historialAcademico.findMany({
      where: { idUser: userId },
      include: { plantillaMallaClase: { include: { clase: true } }, periodo: true },
    });

    type DetalleHistorial = { origen: OrigenHistorial; periodo: string | null; anno: string | null; nota: string | null };
    const aprobadaPorCodigo = new Map<string, DetalleHistorial>();
    const enCursoPorCodigo = new Map<string, DetalleHistorial>();
    for (const h of historialTodo) {
      const codigo = h.plantillaMallaClase.clase.codigo;
      if (!codigo) continue;
      const detalle: DetalleHistorial = {
        origen: (h.origen as OrigenHistorial) ?? OrigenHistorial.ADMIN,
        periodo: h.periodo.periodo,
        anno: h.periodo.anno,
        nota: h.nota,
      };
      // Si ya hay un registro ADMIN para ese código, prevalece sobre uno
      // AUTOREPORTE: una aprobación (o un "en curso") oficial nunca queda
      // "editable".
      const mapa = h.estado === EstadoHistorial.APROBADA ? aprobadaPorCodigo : h.estado === EstadoHistorial.EN_CURSO ? enCursoPorCodigo : null;
      if (mapa && mapa.get(codigo)?.origen !== OrigenHistorial.ADMIN) {
        mapa.set(codigo, detalle);
      }
    }

    const niveles = arbol.niveles.map((nivel) => ({
      nivel: nivel.nivel,
      clases: nivel.clases.map((clase): ClasePensum => {
        const aprobada = aprobadaPorCodigo.get(clase.codigo);
        // Una clase APROBADA nunca se muestra también como "en curso",
        // aunque exista una fila EN_CURSO vieja de un intento anterior.
        const enCurso = aprobada ? undefined : enCursoPorCodigo.get(clase.codigo);
        const detalle = aprobada ?? enCurso;
        return {
          ...clase,
          cursada: aprobada !== undefined,
          enCurso: enCurso !== undefined,
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

  // Autorreporte de "estoy cursando esto ahora mismo", siempre sobre el
  // período vigente según la fecha del servidor — no se pide período ni
  // nota (una clase en curso no tiene nota final todavía). La clave de
  // existencia es clase + período VIGENTE (no "cualquier fila AUTOREPORTE
  // de esta clase"): a diferencia del diseño anterior, ahora una misma
  // clase puede tener varias filas AUTOREPORTE en distintos períodos
  // (cargadas por importarHistorialCsv, ej. reprobada en 2023-1), y no hay
  // que tocarlas al marcar/desmarcar el período actual como en curso.
  async marcarClaseEnCurso(userId: string, claseId: string, currentUser: RequestUser) {
    await this.obtenerEstudianteOFallar(userId);
    const plantillaId = await this.obtenerPlantillaAsignada(userId);
    if (!plantillaId) {
      throw new NotFoundException('Aún no tienes una plantilla de malla curricular asignada.');
    }

    // Mismo criterio que usa inscribir() para bloquear la matrícula: no se
    // puede autorreportar "en curso" una clase ya aprobada, ni una cuyos
    // prerrequisitos todavía no están aprobados (sería un dato falso — no
    // se puede estar cursando una clase que no se puede matricular).
    const malla = await this.construirMallaConEstado(plantillaId, userId, currentUser);
    const estado = malla.niveles.flatMap((n) => n.clases).find((c) => c.id === claseId);
    if (!estado) {
      throw new NotFoundException('La clase indicada no pertenece a tu malla curricular.');
    }
    if (estado.estadoEstudiante === 'APROBADA') {
      throw new BadRequestException('Ya aprobaste esta clase; no se puede marcar como en curso.');
    }
    if (estado.estadoEstudiante === 'BLOQUEADA') {
      const faltantes = estado.prerrequisitosFaltantes.map((r) => r.codigo).join(', ');
      throw new BadRequestException(`No puedes marcarla como en curso: te faltan prerrequisitos (${faltantes}).`);
    }

    const idperiodo = await this.resolverIdPeriodoActual();

    const existente = await this.prisma.historialAcademico.findFirst({
      where: { idUser: userId, idPlantillaMalla_has_Clase: claseId, idperiodo },
    });
    if (existente && (existente.origen === OrigenHistorial.ADMIN || existente.estado !== EstadoHistorial.EN_CURSO)) {
      // Ya hay, para el período vigente, un registro oficial de
      // administrador o un resultado final autorreportado (aprobada/
      // reprobada, ej. importado por CSV): nunca se convierte en "en
      // curso" por encima de un dato ya asentado.
      return;
    }

    if (existente) {
      // Ya estaba en EN_CURSO: no hay nada que actualizar (idempotente).
      return;
    }
    await this.prisma.historialAcademico.create({
      data: {
        idHistorialAcademico: randomUUID(),
        idUser: userId,
        idPlantillaMalla_has_Clase: claseId,
        idperiodo,
        nota: null,
        estado: EstadoHistorial.EN_CURSO,
        origen: OrigenHistorial.AUTOREPORTE,
        createdAt: new Date(),
      },
    });
  }

  async desmarcarClaseEnCurso(userId: string, claseId: string) {
    await this.obtenerEstudianteOFallar(userId);
    const idperiodo = await this.resolverIdPeriodoActual();
    // Acotado al período vigente Y a estado EN_CURSO (no basta con
    // origen AUTOREPORTE): así nunca borra, por accidente, una fila
    // aprobada/reprobada del período actual que haya llegado por CSV.
    await this.prisma.historialAcademico.deleteMany({
      where: {
        idUser: userId,
        idPlantillaMalla_has_Clase: claseId,
        idperiodo,
        origen: OrigenHistorial.AUTOREPORTE,
        estado: EstadoHistorial.EN_CURSO,
      },
    });
  }

  // ---------- Historial académico ----------

  async obtenerHistorial(userId: string) {
    await this.obtenerEstudianteOFallar(userId);
    const historial = await this.prisma.historialAcademico.findMany({
      where: { idUser: userId },
      include: { plantillaMallaClase: { include: { clase: true, posicion: true } }, periodo: true },
      orderBy: [{ periodo: { anno: 'desc' } }, { periodo: { periodo: 'desc' } }, { createdAt: 'desc' }],
    });
    return historial.map((h) => ({
      id: h.idHistorialAcademico,
      periodo: h.periodo.periodo,
      anno: h.periodo.anno,
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

  // Autoservicio de HU-03-03: el estudiante sube su propio historial en lote
  // en vez de esperar a que el administrador lo capture clase por clase. Se
  // resuelve por CÓDIGO de clase (no por id interno, que el estudiante no
  // conoce) contra la plantilla que tiene asignada, y respeta la misma regla
  // que el resto del módulo: un registro ADMIN nunca se sobrescribe desde
  // aquí (misma regla que marcarClaseEnCurso más arriba), así que las filas
  // del CSV que choquen con uno oficial simplemente se cuentan como
  // "omitidas".
  // El CSV no trae columna "estado": el estudiante solo aporta la nota y el
  // estado (APROBADA/REPROBADA) se calcula contra NOTA_MINIMA_APROBACION,
  // para no pedirle un dato que ya se deduce de la nota y evitar que
  // escriba un estado inconsistente con ella.
  //
  // Todo lo que se necesita para resolver CUALQUIER fila (clases de la
  // malla, catálogo de períodos, historial ya existente del estudiante) se
  // trae de una sola vez ANTES del loop y se resuelve en memoria con Maps:
  // así el costo es fijo (3 consultas de lectura) sin importar cuántas
  // filas traiga el CSV, en vez de repetir esas mismas consultas por fila.
  // Las escrituras sí son una por fila (creates/updates distintos), pero
  // van todas en una sola transacción al final.
  async importarHistorialCsv(userId: string, archivo?: Express.Multer.File): Promise<ResultadoImportacionHistorial> {
    await this.obtenerEstudianteOFallar(userId);
    if (!archivo || !archivo.buffer?.length) {
      throw new BadRequestException('Debes adjuntar un archivo CSV con tu historial.');
    }
    if (!/\.csv$/i.test(archivo.originalname ?? '')) {
      throw new BadRequestException('El archivo debe tener extensión .csv.');
    }

    const plantillaId = await this.obtenerPlantillaAsignada(userId);
    if (!plantillaId) {
      throw new BadRequestException('No tienes una plantilla de malla curricular asignada.');
    }

    const [clasesDeLaMalla, periodosCatalogo, historialExistente] = await Promise.all([
      this.prisma.plantillaMalla_has_Clase.findMany({
        where: { idPlantillaMalla: plantillaId },
        include: { clase: true },
      }),
      this.prisma.periodo.findMany(),
      this.prisma.historialAcademico.findMany({ where: { idUser: userId } }),
    ]);

    const pmcPorCodigo = new Map(
      clasesDeLaMalla
        .filter((pmc) => pmc.clase.codigo)
        .map((pmc) => [pmc.clase.codigo!.trim().toUpperCase(), pmc.idPlantillaMalla_has_Clase] as const),
    );
    const idperiodoPorClave = new Map<string, string>(
      periodosCatalogo.map((p) => [`${p.anno}-${p.periodo}`, p.idperiodo]),
    );
    // Igual que registrarHistorial (admin): la clave real de unicidad es
    // idUser + clase + período, SIN distinguir origen — un mismo par
    // clase/período no puede tener dos filas (una ADMIN y otra AUTOREPORTE)
    // al mismo tiempo, porque registrarHistorial tampoco filtra por origen
    // al decidir si actualiza o crea.
    const historialPorClave = new Map(
      historialExistente.map((h) => [`${h.idPlantillaMalla_has_Clase}|${h.idperiodo}`, h] as const),
    );

    const texto = archivo.buffer.toString('utf-8').replace(/^﻿/, '');
    const lineas = texto.split(/\r\n|\r|\n/).filter((linea) => linea.trim().length > 0);
    if (lineas.length === 0) {
      throw new BadRequestException('El archivo CSV está vacío.');
    }

    const encabezadosEsperados = ['codigo', 'periodo', 'nota'];
    const primeraFila = this.parseCsvLine(lineas[0]).map((c) => c.toLowerCase());
    const tieneEncabezado = encabezadosEsperados.every((col, i) => primeraFila[i] === col);
    const filasDatos = tieneEncabezado ? lineas.slice(1) : lineas;
    const offset = tieneEncabezado ? 2 : 1;

    const errores: string[] = [];
    let omitidos = 0;
    const aCrear: Prisma.HistorialAcademicoCreateManyInput[] = [];
    const aActualizar: { id: string; estado: EstadoHistorial; nota: string }[] = [];

    for (let i = 0; i < filasDatos.length; i++) {
      const numeroFila = i + offset;
      const [codigoRaw, periodoRaw, notaRaw] = this.parseCsvLine(filasDatos[i]);

      const codigo = (codigoRaw ?? '').trim().toUpperCase();
      if (!codigo) {
        errores.push(`Fila ${numeroFila}: falta el código de la clase.`);
        continue;
      }
      const pmcId = pmcPorCodigo.get(codigo);
      if (!pmcId) {
        errores.push(`Fila ${numeroFila}: la clase "${codigoRaw}" no existe en tu malla curricular.`);
        continue;
      }

      const periodo = (periodoRaw ?? '').trim();
      if (!/^\d{4}-[12]$/.test(periodo)) {
        errores.push(`Fila ${numeroFila}: el período "${periodoRaw ?? ''}" debe tener el formato AAAA-1 o AAAA-2.`);
        continue;
      }
      const idperiodo = idperiodoPorClave.get(periodo);
      if (!idperiodo) {
        errores.push(
          `Fila ${numeroFila}: no existe el período académico ${periodo} en el catálogo. Pide al administrador que lo registre.`,
        );
        continue;
      }

      // El CSV solo trae la nota (el estudiante no elige "aprobada" o
      // "reprobada" a mano): el estado se deriva de la nota contra
      // NOTA_MINIMA_APROBACION, igual que lo haría una boleta real. Por eso
      // este importador no acepta EN_CURSO — una clase en curso, sin nota
      // final todavía, se sigue autorreportando desde el Pensum.
      if ((notaRaw ?? '').trim() === '') {
        errores.push(`Fila ${numeroFila}: falta la nota.`);
        continue;
      }
      const nota = Number(notaRaw);
      if (Number.isNaN(nota) || nota < 0 || nota > 100) {
        errores.push(`Fila ${numeroFila}: la nota "${notaRaw}" debe ser un número entre 0 y 100.`);
        continue;
      }
      const estado = nota >= NOTA_MINIMA_APROBACION ? EstadoHistorial.APROBADA : EstadoHistorial.REPROBADA;

      const existente = historialPorClave.get(`${pmcId}|${idperiodo}`);
      if (existente?.origen === OrigenHistorial.ADMIN) {
        omitidos++;
        continue;
      }

      if (existente) {
        aActualizar.push({ id: existente.idHistorialAcademico, estado, nota: String(nota) });
      } else {
        aCrear.push({
          idHistorialAcademico: randomUUID(),
          idUser: userId,
          idPlantillaMalla_has_Clase: pmcId,
          idperiodo,
          estado,
          nota: String(nota),
          origen: OrigenHistorial.AUTOREPORTE,
          createdAt: new Date(),
        });
      }
    }

    if (aCrear.length > 0 || aActualizar.length > 0) {
      await this.prisma.$transaction([
        ...(aCrear.length > 0 ? [this.prisma.historialAcademico.createMany({ data: aCrear })] : []),
        ...aActualizar.map((u) =>
          this.prisma.historialAcademico.update({
            where: { idHistorialAcademico: u.id },
            data: { estado: u.estado, nota: u.nota },
          }),
        ),
      ]);
    }

    return { totalFilas: filasDatos.length, registrados: aCrear.length + aActualizar.length, omitidos, errores };
  }

  // Parser CSV mínimo (sin dependencia externa): soporta campos entre
  // comillas dobles con comas o comillas escapadas (""), suficiente para el
  // formato fijo codigo,periodo,nota que espera importarHistorialCsv.
  private parseCsvLine(line: string): string[] {
    const campos: string[] = [];
    let actual = '';
    let entreComillas = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (entreComillas) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            actual += '"';
            i++;
          } else {
            entreComillas = false;
          }
        } else {
          actual += c;
        }
      } else if (c === '"') {
        entreComillas = true;
      } else if (c === ',') {
        campos.push(actual.trim());
        actual = '';
      } else {
        actual += c;
      }
    }
    campos.push(actual.trim());
    return campos;
  }

  async registrarHistorial(userId: string, dto: RegistrarHistorialDto) {
    await this.obtenerEstudianteOFallar(userId);
    const pmc = await this.prisma.plantillaMalla_has_Clase.findUnique({
      where: { idPlantillaMalla_has_Clase: dto.claseId },
    });
    if (!pmc) {
      throw new NotFoundException('La clase indicada no existe.');
    }

    // dto.periodo sigue viajando como "AAAA-P" (el DTO ya lo valida con
    // regex); se resuelve a idperiodo contra el catálogo en vez de
    // guardarse como texto libre.
    const [annoStr, periodoStr] = dto.periodo.split('-');
    const idperiodo = await this.resolverIdPeriodo(Number(annoStr), Number(periodoStr));

    const nota = dto.nota !== undefined ? String(dto.nota) : null;
    const existente = await this.prisma.historialAcademico.findFirst({
      where: { idUser: userId, idPlantillaMalla_has_Clase: dto.claseId, idperiodo },
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
        idperiodo,
        estado: dto.estado,
        nota,
        origen: OrigenHistorial.ADMIN,
        createdAt: new Date(),
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

  // ---------- Inscripción (simulación de matrícula) a clases de un período ----------

  async inscribir(userId: string, claseIds: string[], periodoId: string, currentUser: RequestUser) {
    await this.obtenerEstudianteOFallar(userId);
    // HU-03-04 (AC2/AC3): la simulación queda asociada al período que el
    // estudiante seleccionó justo antes de matricular (no a uno calculado
    // por el servidor a partir de la fecha actual). Se revalida aquí mismo
    // (existe + habilitado) por si el período cambió de estado entre que el
    // estudiante lo eligió y este clic.
    const periodo = await this.obtenerPeriodoHabilitadoOFallar(periodoId, userId);
    const idperiodo = periodo.idperiodo;

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

    // Una clase ya inscrita en CUALQUIER período bloquea volver a inscribirla
    // en otro: la matrícula de una clase es única para el estudiante hasta
    // que cancele esa inscripción (DELETE), no una por período.
    const yaInscritas = await this.prisma.inscripcion.findMany({
      where: { idUser: userId },
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
    // concurrencia (doble submit) contra el índice único (idUser, idPlantillaMalla_has_Clase, idperiodo).
    try {
      const ahora = new Date();
      await this.prisma.inscripcion.createMany({
        data: clases.map((c) => ({
          idInscripcion: randomUUID(),
          idUser: userId,
          idPlantillaMalla_has_Clase: c.idPlantillaMalla_has_Clase,
          idperiodo,
          createdAt: ahora,
        })),
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }

    return this.listarInscripciones(userId);
  }

  // Todas las inscripciones vigentes del estudiante, sin importar en qué
  // período se hicieron: una clase inscrita bloquea volver a inscribirla en
  // otro período (ver inscribir), así que "mis inscripciones" es una sola
  // lista global, no una vista por período.
  async listarInscripciones(userId: string) {
    await this.obtenerEstudianteOFallar(userId);
    const inscripciones = await this.prisma.inscripcion.findMany({
      where: { idUser: userId },
      include: { plantillaMallaClase: { include: { clase: true, posicion: true } }, periodo: true },
      orderBy: { createdAt: 'asc' },
    });
    return inscripciones.map((i) => ({
      id: i.idInscripcion,
      periodoId: i.idperiodo,
      periodo: `${i.periodo.anno}-${i.periodo.periodo}`,
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

  // HU-03-03: HistorialAcademico ya no guarda año/período como texto libre,
  // sino idperiodo -> catálogo "periodo". No se filtra por estado
  // habilitado/deshabilitado aquí a propósito: ese filtro aplica a qué
  // período se puede SELECCIONAR para una simulación nueva (HU-03-04), no a
  // qué período puede describir una nota ya cursada (que puede ser de un
  // período viejo, hoy deshabilitado).
  private async resolverIdPeriodo(anno: number, periodo: number): Promise<string> {
    const encontrado = await this.prisma.periodo.findFirst({
      where: { anno: String(anno), periodo: String(periodo) },
    });
    if (!encontrado) {
      throw new NotFoundException(
        `No existe un período académico registrado para el año ${anno}, período ${periodo}. Pide al administrador que lo registre primero.`,
      );
    }
    return encontrado.idperiodo;
  }

  private async resolverIdPeriodoActual(): Promise<string> {
    const { anno, periodo } = semestreActual();
    return this.resolverIdPeriodo(anno, periodo);
  }

  // HU-03-04 (AC1/AC3): punto único de validación para "iniciar una
  // simulación sobre un período" (catálogo e inscripción): exige un
  // periodoId, y que ese período exista y esté HABILITADO en este momento
  // (no en el momento en que el estudiante lo vio por primera vez) — así,
  // si el admin lo deshabilita mientras el estudiante está en el catálogo,
  // la siguiente acción (recargar catálogo o intentar matricular) lo
  // bloquea con un mensaje claro en vez de dejarlo pasar silenciosamente.
  // Todo rechazo queda auditado (AC3: "cualquier intento de acceso a un
  // período no habilitado") en la misma tabla Auditoria que ya usa el admin
  // para los cambios de estado (ver PeriodoService.cambiarEstado), con
  // campo='acceso_denegado' para distinguirlo de un cambio de valor real.
  private async obtenerPeriodoHabilitadoOFallar(periodoId: string, userId: string) {
    if (!periodoId) {
      throw new BadRequestException('Debes indicar un período académico (periodoId).');
    }
    const periodo = await this.prisma.periodo.findUnique({ where: { idperiodo: periodoId } });
    if (!periodo || periodo.estado !== EstadoPeriodo.HABILITADO) {
      await this.prisma.auditoria.create({
        data: {
          idAuditoria: randomUUID(),
          entidad: 'periodo',
          // idEntidad es VARCHAR(45) en BD: se trunca (en vez de dejar que
          // SQL Server rechace el INSERT) porque periodoId viene del cliente
          // sin límite de longitud, y no queremos que un intento de acceso
          // "raro" tumbe el propio registro de auditoría con un 500.
          idEntidad: periodoId.slice(0, 45),
          campo: 'acceso_denegado',
          valorAnterior: null,
          valorNuevo: periodo?.estado ?? 'INEXISTENTE',
          idUser: userId,
          createdAt: new Date(),
        },
      });
      throw new BadRequestException('El período indicado no existe o ya no está habilitado.');
    }
    return periodo;
  }
}
