// HU-05-03: mapeo de los datos de SIMULA a la solicitud del modelo predictivo
// (contrato v1.3). Funciones puras: reciben lo que EstudianteService ya leyó
// de la BD y devuelven los bloques del contrato, sin tocar Prisma ni la
// configuración, para poder probarlas sin BD (solicitud-simulacion.mapper.spec.ts).
import { EstadoHistorial, OrigenHistorial, TipoClase } from '../common/enums';
import type { AvanceAcademico, MallaConEstado } from './estudiante.service';
import type {
  CargaAcademicaModelo,
  ClaseCargaModelo,
  EstadoHistorialModelo,
  EstudianteModelo,
  HistorialModelo,
  OrigenHistorialModelo,
} from './modelo-predictivo.contrato';

// Estados de HistorialAcademico que entiende el contrato del modelo
// predictivo; una fila con otro valor (o null) no se le envía.
const ESTADOS_HISTORIAL_MODELO = new Set<string>([
  EstadoHistorial.APROBADA,
  EstadoHistorial.REPROBADA,
  EstadoHistorial.EN_CURSO,
  EstadoHistorial.NSP,
]);

// Lo que el mapeo necesita de cada fila; las filas de Prisma lo cumplen.
export interface ClaseCatalogoMapeo {
  codigo: string | null;
  nombre: string | null;
  unidadesValorativas: number | null;
}

export interface InscripcionMapeo {
  plantillaMallaClase: {
    idPlantillaMalla_has_Clase: string;
    obligatoria: boolean | null;
    clase: ClaseCatalogoMapeo;
    posicion: { nivel: number | null };
  };
}

export interface IntentoMapeo {
  estado: string | null;
  nota: string | null;
  plantillaMallaClase: { clase: Pick<ClaseCatalogoMapeo, 'unidadesValorativas'> };
}

export interface RegistroHistorialMapeo extends IntentoMapeo {
  origen: string | null;
  plantillaMallaClase: { clase: ClaseCatalogoMapeo };
  periodo: { anno: string | null; periodo: string | null };
}

export interface PeriodoMapeo {
  idperiodo: string;
  anno: string | null;
  periodo: string | null;
}

// La carga en el formato del contrato, más el id PlantillaMalla_has_Clase de
// cada código (lo necesita la tabla Simulacion_has_Clase, no el modelo).
export interface CargaMapeada {
  cargaAcademica: CargaAcademicaModelo;
  idPorCodigo: Map<string, string>;
}

// Carga = clases inscritas en el período. Una inscripción puede apuntar a
// otra versión de la malla (reasignación del admin): se busca por id y luego
// por código en la malla actual, y si ya no existe en ella se arma con los
// datos de la propia inscripción.
export function mapearCargaAcademica(
  periodo: PeriodoMapeo,
  inscripciones: InscripcionMapeo[],
  malla: MallaConEstado,
  limiteUnidadesValorativas: number,
): CargaMapeada {
  const clasesMalla = malla.niveles.flatMap((n) => n.clases);
  const mallaPorId = new Map(clasesMalla.map((c) => [c.id, c]));
  const mallaPorCodigo = new Map(clasesMalla.map((c) => [c.codigo, c]));

  const inscritas = inscripciones.map((i): { id: string; clase: ClaseCargaModelo } => {
    const pmc = i.plantillaMallaClase;
    const actual = mallaPorId.get(pmc.idPlantillaMalla_has_Clase) ?? mallaPorCodigo.get(pmc.clase.codigo ?? '');
    if (actual) {
      return {
        id: actual.id,
        clase: {
          codigoClase: actual.codigo,
          nombreClase: actual.nombre,
          unidadesValorativas: actual.unidadesValorativas,
          nivel: actual.nivel,
          obligatoria: actual.tipo === TipoClase.OBLIGATORIA,
          origen: 'INSCRITA',
          prerrequisitos: actual.prerrequisitos.map((r) => r.codigo),
          correquisitos: actual.correquisitos.map((r) => r.codigo),
        },
      };
    }
    return {
      id: pmc.idPlantillaMalla_has_Clase,
      clase: {
        codigoClase: pmc.clase.codigo ?? '',
        nombreClase: pmc.clase.nombre,
        unidadesValorativas: pmc.clase.unidadesValorativas ?? 0,
        nivel: pmc.posicion.nivel ?? 0,
        obligatoria: pmc.obligatoria !== false,
        origen: 'INSCRITA',
        prerrequisitos: [],
        correquisitos: [],
      },
    };
  });

  // Entre inscripciones de distintas versiones de la malla podría repetirse
  // un código (o resolverse a la misma clase actual), y el modelo cruza
  // por código. validarSimulacion ya bloquea los duplicados; esto solo
  // cubre que se inscriba algo entre la validación y este punto.
  const idPorCodigo = new Map<string, string>();
  const clases: ClaseCargaModelo[] = [];
  for (const { id, clase } of inscritas) {
    if (!idPorCodigo.has(clase.codigoClase)) {
      idPorCodigo.set(clase.codigoClase, id);
      clases.push(clase);
    }
  }

  return {
    cargaAcademica: {
      periodo: { id: periodo.idperiodo, anno: periodo.anno ?? '', periodo: periodo.periodo ?? '' },
      limiteUnidadesValorativas,
      clases,
      totalUnidadesValorativas: clases.reduce((total, c) => total + c.unidadesValorativas, 0),
    },
    idPorCodigo,
  };
}

// `idEstudiante` llega ya seudonimizado (MotorPredictivo.seudonimoEstudiante).
export function mapearEstudiante(datos: {
  idEstudiante: string;
  malla: MallaConEstado;
  carrera: { codigo: string | null; nombre: string | null } | null;
  nivelSugerido: number;
  registros: IntentoMapeo[];
}): EstudianteModelo {
  const { malla, carrera } = datos;
  return {
    idEstudiante: datos.idEstudiante,
    // D1: no se comparte el código institucional; el modelo recibe el
    // historial completo y no necesita buscar al estudiante por su cuenta.
    codigoEstudiantil: null,
    carrera: { id: malla.plantilla.carreraId, codigo: carrera?.codigo ?? null, nombre: carrera?.nombre ?? null },
    malla: { id: malla.plantilla.id, nombre: malla.plantilla.nombre, version: malla.plantilla.version },
    nivelSugerido: datos.nivelSugerido,
    avance: {
      ...calcularAvance(malla),
      indiceAcademico: calcularIndiceAcademico(datos.registros).indiceAcademico,
    },
  };
}

// Se envían TODOS los intentos (reprobadas, NSP y repeticiones incluidas), sin
// deduplicar y en el orden recibido (la consulta los trae por período
// ascendente): los intentos fallidos son la señal más útil para predecir.
// Nivel y obligatoriedad salen de la malla ACTUAL cruzando por código
// (igual que construirMallaConEstado), y quedan en null si la clase ya no
// pertenece a ella.
// Las equivalencias (clases acreditadas de otra institución, período
// reservado "0000", sin nota) no se envían: no son intentos cursados aquí y
// el contrato v1.3 solo admite origen ADMIN/AUTOREPORTE. Igual cuentan como
// aprobadas en la malla, y por eso en el avance que sí se envía.
export function mapearHistorial(registros: RegistroHistorialMapeo[], malla: MallaConEstado): HistorialModelo[] {
  const clasesPorCodigo = new Map(malla.niveles.flatMap((n) => n.clases).map((c) => [c.codigo, c]));
  return registros
    .filter((h) => ESTADOS_HISTORIAL_MODELO.has(h.estado ?? '') && h.origen !== OrigenHistorial.EQUIVALENCIA)
    .map((h): HistorialModelo => {
      const codigo = h.plantillaMallaClase.clase.codigo ?? '';
      const claseActual = clasesPorCodigo.get(codigo);
      const estado = h.estado as EstadoHistorialModelo;
      const nota = h.nota !== null && h.nota.trim() !== '' ? Number(h.nota) : NaN;
      return {
        codigoClase: codigo,
        nombreClase: h.plantillaMallaClase.clase.nombre,
        unidadesValorativas: h.plantillaMallaClase.clase.unidadesValorativas ?? 0,
        nivel: claseActual?.nivel ?? null,
        obligatoria: claseActual ? claseActual.tipo === TipoClase.OBLIGATORIA : null,
        periodo: { anno: h.periodo.anno ?? '', periodo: h.periodo.periodo ?? '' },
        estado,
        nota: estado !== EstadoHistorial.EN_CURSO && Number.isFinite(nota) ? nota : null,
        origen: (h.origen as OrigenHistorialModelo) ?? OrigenHistorial.ADMIN,
      };
    });
}

export function calcularAvance(malla: MallaConEstado): AvanceAcademico {
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
        ? Math.round((unidadesValorativasAprobadasObligatorias / unidadesValorativasTotalesObligatorias) * 100)
        : 0,
  };
}

export function calcularSemestreSugerido(malla: MallaConEstado): number {
  const nivelesAprobados = malla.niveles
    .flatMap((n) => n.clases)
    .filter((c) => c.tipo === TipoClase.OBLIGATORIA && c.estadoEstudiante === 'APROBADA')
    .map((c) => c.nivel);
  return nivelesAprobados.length > 0 ? Math.max(...nivelesAprobados) + 1 : 1;
}

// Índice académico = Σ(nota × U.V.) / Σ(U.V.). Cuentan todos los intentos
// aprobados y reprobados (también las repeticiones); NSP y EN_CURSO no
// tienen nota y quedan fuera.
export function calcularIndiceAcademico(intentos: IntentoMapeo[]): {
  indiceAcademico: number | null;
  clasesConsideradas: number;
} {
  let sumaPonderada = 0;
  let sumaUnidades = 0;
  let clasesConsideradas = 0;
  for (const intento of intentos) {
    if (intento.estado !== EstadoHistorial.APROBADA && intento.estado !== EstadoHistorial.REPROBADA) {
      continue;
    }
    const nota = intento.nota !== null && intento.nota.trim() !== '' ? Number(intento.nota) : NaN;
    if (!Number.isFinite(nota)) {
      continue;
    }
    const unidadesValorativas = intento.plantillaMallaClase.clase.unidadesValorativas ?? 0;
    sumaPonderada += nota * unidadesValorativas;
    sumaUnidades += unidadesValorativas;
    clasesConsideradas++;
  }
  return {
    indiceAcademico: sumaUnidades > 0 ? Math.round((sumaPonderada / sumaUnidades) * 100) / 100 : null,
    clasesConsideradas,
  };
}
