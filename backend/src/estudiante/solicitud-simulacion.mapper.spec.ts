import { ConfigService } from '@nestjs/config';
import { RequisitoView } from '../curriculum/curriculum.service';
import { ClaseConEstado, EstadoClaseEstudiante, MallaConEstado } from './estudiante.service';
import { SolicitudEvaluacionCarga, nuevoControlSolicitud } from './modelo-predictivo.contrato';
import { ModeloPredictivoService } from './modelo-predictivo.service';
import {
  InscripcionMapeo,
  RegistroHistorialMapeo,
  calcularSemestreSugerido,
  mapearCargaAcademica,
  mapearEstudiante,
  mapearHistorial,
} from './solicitud-simulacion.mapper';

// HU-05-03, criterio 5: pruebas del mapeo de los datos de SIMULA a la
// solicitud de evaluación de carga (contrato v1.3), sin BD.

const USER_ID = '3f2b8c1e-7d4a-4e0b-9c1f-2a6d8e4b5c71';
const LIMITE_UV = 25;
const PERIODO = { idperiodo: 'PER-2026-1', anno: '2026', periodo: '1' };

const modelo = new ModeloPredictivoService({
  get: (clave: string) => ({ PREDICTIVE_MODEL_PSEUDONYM_KEY: 'clave-de-pruebas' })[clave],
} as unknown as ConfigService);

// ---------- Constructores de datos de prueba ----------

function requisito(codigo: string): RequisitoView {
  return { relacionId: `rel-${codigo}`, claseId: `cat-${codigo}`, codigo, nombre: codigo };
}

function claseMalla(
  codigo: string,
  datos: {
    uv: number;
    nivel: number;
    tipo?: 'OBLIGATORIA' | 'ELECTIVA';
    estado?: EstadoClaseEstudiante;
    pre?: string[];
    co?: string[];
  },
): ClaseConEstado {
  return {
    id: `pmc-${codigo}`,
    claseId: `cat-${codigo}`,
    codigo,
    nombre: `Clase ${codigo}`,
    unidadesValorativas: datos.uv,
    nivel: datos.nivel,
    tipo: datos.tipo ?? 'OBLIGATORIA',
    posX: null,
    posY: null,
    prerrequisitos: (datos.pre ?? []).map(requisito),
    correquisitos: (datos.co ?? []).map(requisito),
    estadoEstudiante: datos.estado ?? 'DISPONIBLE',
    prerrequisitosFaltantes: [],
  };
}

function malla(clases: ClaseConEstado[]): MallaConEstado {
  const niveles = [...new Set(clases.map((c) => c.nivel))].sort((a, b) => a - b);
  return {
    plantilla: { id: 'malla-is-2024', nombre: 'Ingeniería en Sistemas', version: 2, activa: true, carreraId: 'car-is' },
    niveles: niveles.map((nivel) => ({ nivel, clases: clases.filter((c) => c.nivel === nivel) })),
  };
}

// Inscripción a la clase de la malla actual (id pmc-<código>).
function inscripcion(c: ClaseConEstado): InscripcionMapeo {
  return inscripcionExterna(c.id, c.codigo, { uv: c.unidadesValorativas, nivel: c.nivel });
}

// Inscripción que apunta a una fila de otra versión de la malla.
function inscripcionExterna(
  id: string,
  codigo: string,
  datos: { uv: number; nivel: number; obligatoria?: boolean | null },
): InscripcionMapeo {
  return {
    plantillaMallaClase: {
      idPlantillaMalla_has_Clase: id,
      obligatoria: datos.obligatoria ?? true,
      clase: { codigo, nombre: `Clase ${codigo}`, unidadesValorativas: datos.uv },
      posicion: { nivel: datos.nivel },
    },
  };
}

function registro(
  codigo: string,
  datos: { uv: number; estado: string | null; nota: string | null; periodo: string; origen?: string | null },
): RegistroHistorialMapeo {
  const [anno, periodo] = datos.periodo.split('-');
  return {
    estado: datos.estado,
    nota: datos.nota,
    origen: datos.origen === undefined ? 'ADMIN' : datos.origen,
    plantillaMallaClase: { clase: { codigo, nombre: `Clase ${codigo}`, unidadesValorativas: datos.uv } },
    periodo: { anno, periodo },
  };
}

// Arma la solicitud completa igual que SIMULA: mapeo + campos de control.
function armarSolicitud(m: MallaConEstado, inscripciones: InscripcionMapeo[], registros: RegistroHistorialMapeo[]) {
  const carga = mapearCargaAcademica(PERIODO, inscripciones, m, LIMITE_UV);
  const solicitud: SolicitudEvaluacionCarga = {
    ...nuevoControlSolicitud(),
    estudiante: mapearEstudiante({
      idEstudiante: modelo.seudonimoEstudiante(USER_ID),
      malla: m,
      carrera: { codigo: 'IS', nombre: 'Ingeniería en Sistemas' },
      nivelSugerido: calcularSemestreSugerido(m),
      registros,
    }),
    historial: mapearHistorial(registros, m),
    cargaAcademica: carga.cargaAcademica,
  };
  return { solicitud, idPorCodigo: carga.idPorCodigo };
}

// Claves que delatarían datos personales que el modelo no usa.
const CLAVES_PERSONALES = [
  'nombreCompleto',
  'NombreCompleto',
  'correo',
  'correoInstitucional',
  'email',
  'codigoInstitucional',
  'idUser',
];

function clavesDe(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(clavesDe);
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) => [k, ...clavesDe(v)]);
  }
  return [];
}

// Comprobaciones comunes a los tres casos: cumple el contrato y no lleva
// datos personales.
function esperarSolicitudConforme(solicitud: SolicitudEvaluacionCarga) {
  expect(ModeloPredictivoService.erroresSolicitudEvaluacionCarga(solicitud)).toEqual([]);
  expect(solicitud.versionContrato).toBe('1.3');
  expect(solicitud.idSolicitud).toMatch(/^[0-9a-f-]{36}$/);
  expect(Number.isNaN(Date.parse(solicitud.fechaSolicitud))).toBe(false);

  const claves = clavesDe(solicitud);
  for (const clave of CLAVES_PERSONALES) {
    expect(claves).not.toContain(clave);
  }
  expect(solicitud.estudiante.codigoEstudiantil).toBeNull();
  expect(solicitud.estudiante.idEstudiante).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(solicitud)).not.toContain(USER_ID);
}

// ---------- Casos ----------

describe('Mapeo de la solicitud de simulación (HU-05-03)', () => {
  describe('carga típica', () => {
    const clases = {
      mm110: claseMalla('MM-110', { uv: 5, nivel: 1, estado: 'APROBADA' }),
      is110: claseMalla('IS-110', { uv: 4, nivel: 1, estado: 'APROBADA' }),
      fs100: claseMalla('FS-100', { uv: 4, nivel: 1, estado: 'APROBADA' }),
      hu101: claseMalla('HU-101', { uv: 3, nivel: 1, tipo: 'ELECTIVA' }),
      mm211: claseMalla('MM-211', { uv: 5, nivel: 2, pre: ['MM-110'] }),
      is210: claseMalla('IS-210', { uv: 4, nivel: 2, pre: ['IS-110'] }),
      fs200: claseMalla('FS-200', { uv: 4, nivel: 2, pre: ['FS-100'] }),
      is212: claseMalla('IS-212', { uv: 3, nivel: 2, co: ['IS-210'] }),
    };
    const m = malla(Object.values(clases));
    const registros = [
      registro('MM-110', { uv: 5, estado: 'REPROBADA', nota: '50', periodo: '2024-1' }),
      registro('IS-110', { uv: 4, estado: 'APROBADA', nota: '88', periodo: '2024-1' }),
      registro('MM-110', { uv: 5, estado: 'APROBADA', nota: '75', periodo: '2024-2' }),
      registro('FS-100', { uv: 4, estado: 'APROBADA', nota: '70', periodo: '2024-2', origen: 'AUTOREPORTE' }),
    ];
    const { solicitud, idPorCodigo } = armarSolicitud(
      m,
      [clases.mm211, clases.is210, clases.fs200, clases.is212, clases.hu101].map(inscripcion),
      registros,
    );

    it('cumple el contrato v1.3 y no lleva datos personales', () => {
      esperarSolicitudConforme(solicitud);
    });

    it('mapea la carga inscrita con requisitos, obligatoriedad y total de U.V.', () => {
      const { cargaAcademica } = solicitud;
      expect(cargaAcademica.periodo).toEqual({ id: 'PER-2026-1', anno: '2026', periodo: '1' });
      expect(cargaAcademica.limiteUnidadesValorativas).toBe(25);
      expect(cargaAcademica.clases.map((c) => c.codigoClase)).toEqual(['MM-211', 'IS-210', 'FS-200', 'IS-212', 'HU-101']);
      expect(cargaAcademica.totalUnidadesValorativas).toBe(19);
      expect(cargaAcademica.clases[0]).toEqual({
        codigoClase: 'MM-211',
        nombreClase: 'Clase MM-211',
        unidadesValorativas: 5,
        nivel: 2,
        obligatoria: true,
        origen: 'INSCRITA',
        prerrequisitos: ['MM-110'],
        correquisitos: [],
      });
      expect(cargaAcademica.clases[3].correquisitos).toEqual(['IS-210']);
      expect(cargaAcademica.clases[4].obligatoria).toBe(false);
      expect(idPorCodigo.get('MM-211')).toBe('pmc-MM-211');
    });

    it('envía todos los intentos en orden, incluida la reprobada y su repetición', () => {
      expect(solicitud.historial.map((h) => [h.codigoClase, h.estado, h.nota])).toEqual([
        ['MM-110', 'REPROBADA', 50],
        ['IS-110', 'APROBADA', 88],
        ['MM-110', 'APROBADA', 75],
        ['FS-100', 'APROBADA', 70],
      ]);
      expect(solicitud.historial[0]).toMatchObject({ nivel: 1, obligatoria: true, periodo: { anno: '2024', periodo: '1' } });
      expect(solicitud.historial[3].origen).toBe('AUTOREPORTE');
    });

    it('calcula perfil, avance e índice académico ponderado', () => {
      expect(solicitud.estudiante).toEqual({
        idEstudiante: modelo.seudonimoEstudiante(USER_ID),
        codigoEstudiantil: null,
        carrera: { id: 'car-is', codigo: 'IS', nombre: 'Ingeniería en Sistemas' },
        malla: { id: 'malla-is-2024', nombre: 'Ingeniería en Sistemas', version: 2 },
        nivelSugerido: 2,
        avance: {
          unidadesValorativasAprobadas: 13,
          unidadesValorativasAprobadasObligatorias: 13,
          unidadesValorativasTotalesObligatorias: 29,
          porcentajeMallaCompletada: 45,
          // (50×5 + 88×4 + 75×5 + 70×4) / 18 = 69.833…
          indiceAcademico: 69.83,
        },
      });
    });
  });

  describe('carga mínima', () => {
    const is110 = claseMalla('IS-110', { uv: 4, nivel: 1 });
    const m = malla([claseMalla('MM-110', { uv: 5, nivel: 1 }), is110]);
    const registros = [registro('MM-110', { uv: 5, estado: 'NSP', nota: null, periodo: '2025-1' })];
    const { solicitud } = armarSolicitud(m, [inscripcion(is110)], registros);

    it('cumple el contrato v1.3 y no lleva datos personales', () => {
      esperarSolicitudConforme(solicitud);
    });

    it('una sola clase, sin requisitos', () => {
      expect(solicitud.cargaAcademica.clases).toHaveLength(1);
      expect(solicitud.cargaAcademica.clases[0]).toMatchObject({ codigoClase: 'IS-110', prerrequisitos: [], correquisitos: [] });
      expect(solicitud.cargaAcademica.totalUnidadesValorativas).toBe(4);
    });

    it('un solo período cursado con NSP: sin nota y sin índice académico', () => {
      expect(solicitud.historial).toEqual([
        {
          codigoClase: 'MM-110',
          nombreClase: 'Clase MM-110',
          unidadesValorativas: 5,
          nivel: 1,
          obligatoria: true,
          periodo: { anno: '2025', periodo: '1' },
          estado: 'NSP',
          nota: null,
          origen: 'ADMIN',
        },
      ]);
      expect(solicitud.estudiante.nivelSugerido).toBe(1);
      expect(solicitud.estudiante.avance).toEqual({
        unidadesValorativasAprobadas: 0,
        unidadesValorativasAprobadasObligatorias: 0,
        unidadesValorativasTotalesObligatorias: 9,
        porcentajeMallaCompletada: 0,
        indiceAcademico: null,
      });
    });
  });

  describe('carga con datos académicos límite', () => {
    const x101 = claseMalla('IS-101', { uv: 5, nivel: 1, estado: 'APROBADA' });
    const electivas = ['EL-201', 'EL-202', 'EL-203', 'EL-204'].map((codigo) =>
      claseMalla(codigo, { uv: 5, nivel: 2, tipo: 'ELECTIVA' }),
    );
    const m = malla([x101, ...electivas]);
    const inscripciones = [
      ...electivas.map(inscripcion),
      // Misma clase que EL-201 pero de otra versión de la malla: se resuelve
      // por código a la clase actual y se descarta como duplicada.
      inscripcionExterna('pmc-v1-EL-201', 'EL-201', { uv: 5, nivel: 3 }),
      // Clase que ya no existe en la malla actual: se arma con los datos de
      // la propia inscripción, sin requisitos.
      inscripcionExterna('pmc-v1-IS-999', 'IS-999', { uv: 5, nivel: 4, obligatoria: false }),
    ];
    const registros = [
      registro('IS-101', { uv: 5, estado: 'REPROBADA', nota: '0', periodo: '2024-1' }),
      registro('IS-101', { uv: 5, estado: 'APROBADA', nota: '100', periodo: '2024-2' }),
      registro('IS-050', { uv: 3, estado: 'APROBADA', nota: '  ', periodo: '2024-2', origen: null }),
      registro('EL-201', { uv: 5, estado: 'EN_CURSO', nota: '80', periodo: '2025-1' }),
      registro('IS-101', { uv: 5, estado: null, nota: '90', periodo: '2025-1' }),
      registro('IS-101', { uv: 5, estado: 'RETIRADA', nota: null, periodo: '2025-1' }),
      // Equivalencia: aprobada sin nota, período reservado "0000"; no se envía.
      registro('EG-011', { uv: 4, estado: 'APROBADA', nota: null, periodo: '0000-0', origen: 'EQUIVALENCIA' }),
    ];
    const { solicitud, idPorCodigo } = armarSolicitud(m, inscripciones, registros);

    it('cumple el contrato v1.3 y no lleva datos personales', () => {
      esperarSolicitudConforme(solicitud);
    });

    it('carga exactamente en el tope de 25 U.V., sin duplicados', () => {
      const { cargaAcademica } = solicitud;
      expect(cargaAcademica.clases.map((c) => c.codigoClase)).toEqual(['EL-201', 'EL-202', 'EL-203', 'EL-204', 'IS-999']);
      expect(cargaAcademica.totalUnidadesValorativas).toBe(LIMITE_UV);
      expect(cargaAcademica.totalUnidadesValorativas).toBe(cargaAcademica.limiteUnidadesValorativas);
      expect(idPorCodigo.get('EL-201')).toBe('pmc-EL-201');
    });

    it('arma con sus propios datos la clase que ya no está en la malla actual', () => {
      expect(solicitud.cargaAcademica.clases[4]).toEqual({
        codigoClase: 'IS-999',
        nombreClase: 'Clase IS-999',
        unidadesValorativas: 5,
        nivel: 4,
        obligatoria: false,
        origen: 'INSCRITA',
        prerrequisitos: [],
        correquisitos: [],
      });
      expect(idPorCodigo.get('IS-999')).toBe('pmc-v1-IS-999');
    });

    it('notas 0 y 100, nota vacía, EN_CURSO sin nota; estados desconocidos y equivalencias fuera', () => {
      expect(solicitud.historial.map((h) => [h.codigoClase, h.estado, h.nota])).toEqual([
        ['IS-101', 'REPROBADA', 0],
        ['IS-101', 'APROBADA', 100],
        ['IS-050', 'APROBADA', null],
        ['EL-201', 'EN_CURSO', null],
      ]);
      // Clase que ya no está en la malla actual y origen ausente.
      expect(solicitud.historial[2]).toMatchObject({ nivel: null, obligatoria: null, origen: 'ADMIN' });
    });

    it('índice con notas extremas, malla obligatoria completa al 100 %', () => {
      expect(solicitud.estudiante.avance).toEqual({
        unidadesValorativasAprobadas: 5,
        unidadesValorativasAprobadasObligatorias: 5,
        unidadesValorativasTotalesObligatorias: 5,
        porcentajeMallaCompletada: 100,
        // (0×5 + 100×5) / 10; la nota vacía no cuenta.
        indiceAcademico: 50,
      });
      expect(solicitud.estudiante.nivelSugerido).toBe(2);
    });
  });
});
