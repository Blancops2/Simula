import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { AddressInfo, createServer as crearServidorTcp } from 'net';
import { IncomingMessage, Server, ServerResponse, createServer } from 'http';
import { resolve } from 'path';
import { Global, INestApplicationContext, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RequestUser } from '../auth/decorators/current-user.decorator';
import { EstadoSimulacion } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { EstudianteModule } from './estudiante.module';
import { EstudianteService, SimulacionRespuesta } from './estudiante.service';
import { EstudianteModelo, HistorialModelo, SolicitudEvaluacionCarga } from './modelo-predictivo.contrato';
import { MotorPredictivo } from './motor-predictivo';

// Criterio 5 de la capa de integración con el motor predictivo: el flujo
// completo de simulación funciona igual con el mock y con el API real, y lo
// único que cambia entre uno y otro es la configuración (PREDICTIVE_MODEL_URL).
//
// Flujo cubierto: EstudianteService.simular() → MotorPredictivo resuelto por
// el módulo real de Nest según el entorno → HTTP → motor → validación de la
// respuesta contra el contrato → riesgo calculado por SIMULA → guardado en la
// simulación → respuesta que recibe la UI. Motores:
//   - mock: el servidor real de mock-modelo-predictivo/, en otro proceso.
//   - API real: un stub HTTP del contrato v1.3, sin la marca de origen "mock".
// Fuera de alcance: la BD real y la etapa 1 (armar la estructura de entrada
// desde las tablas, cubierta por solicitud-simulacion.mapper.spec.ts); aquí
// la simulación ya generada vive en una BD en memoria.

const RUTA_MOCK = resolve(__dirname, '../../../mock-modelo-predictivo/servidor.mjs');
const USER_ID = '3f2b8c1e-7d4a-4e0b-9c1f-2a6d8e4b5c71';
const PERIODO = { idperiodo: 'PER-2026-1', anno: '2026', periodo: '1', estado: 'HABILITADO', periodoActual: true };
const VARIABLES = ['PREDICTIVE_MODEL_URL', 'PREDICTIVE_MODEL_TIMEOUT_MS', 'PREDICTIVE_MODEL_PSEUDONYM_KEY'] as const;

jest.setTimeout(30000);

// ---------- Motores ----------

async function puertoLibre(): Promise<number> {
  const servidor = crearServidorTcp();
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address() as AddressInfo;
  await new Promise((r) => servidor.close(r));
  return port;
}

async function iniciarMock(): Promise<{ proceso: ChildProcess; url: string }> {
  const puerto = await puertoLibre();
  const proceso = spawn(process.execPath, [RUTA_MOCK], {
    env: { ...process.env, MOCK_PUERTO: String(puerto), MOCK_API_KEY: '', MOCK_ESCENARIO: 'normal' },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${puerto}`;
  for (let intento = 0; intento < 50; intento++) {
    try {
      if ((await fetch(`${base}/salud`)).ok) {
        return { proceso, url: `${base}/v1` };
      }
    } catch {
      // Todavía no escucha.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proceso.kill();
  throw new Error(`El mock (${RUTA_MOCK}) no arrancó en el puerto ${puerto}.`);
}

// Stub del API real: responde según el contrato v1.3 a partir de la petición,
// sin "source"/X-Source (así se ve el modelo real). `modo` permite forzar las
// fallas que la capa debe traducir a errores de dominio.
type ModoStub = 'normal' | 'respuesta_invalida' | 'lento';

async function iniciarStubApiReal(): Promise<{
  servidor: Server;
  url: string;
  modo: (m: ModoStub) => void;
  peticiones: SolicitudEvaluacionCarga[];
}> {
  let modo: ModoStub = 'normal';
  const peticiones: SolicitudEvaluacionCarga[] = [];
  const servidor = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let texto = '';
    for await (const trozo of req) texto += trozo;
    const peticion = JSON.parse(texto) as SolicitudEvaluacionCarga;
    peticiones.push(peticion);
    if (req.url !== '/api/v1/evaluacion-carga') {
      res.writeHead(404).end();
      return;
    }
    if (modo === 'lento') {
      await new Promise((r) => setTimeout(r, 1000));
    }
    const cuerpo =
      modo === 'respuesta_invalida'
        ? { idSolicitud: peticion.idSolicitud, resultado: 'no cumple el contrato' }
        : {
            versionContrato: '1.3',
            idSolicitud: peticion.idSolicitud,
            versionModelo: 'stub-real-2026.10',
            probabilidadAprobarTodo: 0.62,
            clases: peticion.cargaAcademica.clases.map((c, i) => ({
              codigoClase: c.codigoClase,
              probabilidadAprobacion: i === 0 ? 0.81 : 0.55,
              factores: [`Factor del modelo real para ${c.codigoClase}.`],
            })),
            observaciones: ['Observación del modelo real.'],
          };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(cuerpo));
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address() as AddressInfo;
  return { servidor, url: `http://127.0.0.1:${port}/api/v1`, modo: (m) => (modo = m), peticiones };
}

// ---------- BD en memoria (solo las tablas de la simulación) ----------

type FilaSimulacion = Record<string, unknown> & { idSimulacion: string; idUser: string };
type FilaClase = Record<string, unknown> & { idSimulacion: string; codigoClase: string };

function crearBdEnMemoria() {
  const simulaciones = new Map<string, FilaSimulacion>();
  const clases: FilaClase[] = [];
  const conRelaciones = (s: FilaSimulacion) => ({
    ...s,
    periodo: PERIODO,
    clases: clases.filter((c) => c.idSimulacion === s.idSimulacion),
  });
  const prisma = {
    periodo: {
      findFirst: async ({ where }: { where: { periodoActual: boolean } }) =>
        PERIODO.periodoActual === where.periodoActual ? PERIODO : null,
    },
    simulacion: {
      findMany: async ({
        where,
        take,
      }: {
        where: { idUser: string; idperiodo: string };
        orderBy: { createdAt: 'desc' };
        take: number;
      }) =>
        [...simulaciones.values()]
          .filter((s) => s.idUser === where.idUser && s.idperiodo === where.idperiodo)
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())
          .slice(0, take)
          .map(conRelaciones),
      findUniqueOrThrow: async ({ where }: { where: { idSimulacion: string } }) =>
        conRelaciones(simulaciones.get(where.idSimulacion)!),
      findFirst: async ({ where }: { where: { idSimulacion: string; idUser: string } }) => {
        const s = simulaciones.get(where.idSimulacion);
        return s && s.idUser === where.idUser ? conRelaciones(s) : null;
      },
      update: async ({ where, data }: { where: { idSimulacion: string }; data: Record<string, unknown> }) =>
        Object.assign(simulaciones.get(where.idSimulacion)!, data),
      updateMany: async ({
        where: { idSimulacion, ...filtro },
        data,
      }: {
        where: { idSimulacion: string } & Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const s = simulaciones.get(idSimulacion);
        const coincide = !!s && Object.entries(filtro).every(([campo, valor]) => s[campo] === valor);
        if (coincide) Object.assign(s, data);
        return { count: coincide ? 1 : 0 };
      },
    },
    simulacion_has_Clase: {
      update: async ({
        where,
        data,
      }: {
        where: { idSimulacion_codigoClase: { idSimulacion: string; codigoClase: string } };
        data: Record<string, unknown>;
      }) => {
        const { idSimulacion, codigoClase } = where.idSimulacion_codigoClase;
        return Object.assign(clases.find((c) => c.idSimulacion === idSimulacion && c.codigoClase === codigoClase)!, data);
      },
    },
    $transaction: (operaciones: Promise<unknown>[]) => Promise.all(operaciones),
  };
  return { prisma, simulaciones, clases };
}

// Simulación ya generada (etapa 1), con la estructura que guarda generarSimulacion().
function guardarSimulacionGenerada(bd: ReturnType<typeof crearBdEnMemoria>, motor: MotorPredictivo): string {
  const idSimulacion = `sim-${bd.simulaciones.size + 1}`;
  const estudiante: EstudianteModelo = {
    idEstudiante: motor.seudonimoEstudiante(USER_ID),
    codigoEstudiantil: null,
    carrera: { id: 'car-is', codigo: 'IS', nombre: 'Ingeniería en Sistemas' },
    malla: { id: 'malla-is-2024', nombre: 'Ingeniería en Sistemas', version: 2 },
    nivelSugerido: 2,
    avance: {
      unidadesValorativasAprobadas: 5,
      unidadesValorativasAprobadasObligatorias: 5,
      unidadesValorativasTotalesObligatorias: 180,
      porcentajeMallaCompletada: 3,
      indiceAcademico: 75,
    },
  };
  const historial: HistorialModelo[] = [
    {
      codigoClase: 'MM-110',
      nombreClase: 'Matemática I',
      unidadesValorativas: 5,
      nivel: 1,
      obligatoria: true,
      periodo: { anno: '2025', periodo: '3' },
      estado: 'APROBADA',
      nota: 75,
      origen: 'ADMIN',
    },
  ];
  bd.simulaciones.set(idSimulacion, {
    idSimulacion,
    idUser: USER_ID,
    idperiodo: PERIODO.idperiodo,
    idPlantillaMalla: 'malla-is-2024',
    estadoPeriodo: PERIODO.estado,
    estado: EstadoSimulacion.GENERADA,
    nivelSugerido: 2,
    limiteUnidadesValorativas: 25,
    totalUnidadesValorativas: 9,
    versionContrato: '1.3',
    idSolicitud: randomUUID(),
    estudianteModelo: JSON.stringify(estudiante),
    historialModelo: JSON.stringify(historial),
    probabilidadAprobarTodo: null,
    // Una por milisegundo, para que el orden por fecha sea determinista.
    createdAt: new Date(Date.UTC(2026, 9, 17, 12, 0, 0, bd.simulaciones.size)),
  });
  const clase = (codigoClase: string, nombreClase: string, unidadesValorativas: number, prerrequisitos: string[]) => ({
    idSimulacion,
    idPlantillaMalla_has_Clase: `pmc-${codigoClase}`,
    codigoClase,
    nombreClase,
    unidadesValorativas,
    nivel: 2,
    obligatoria: true,
    origen: 'INSCRITA',
    prerrequisitos: JSON.stringify(prerrequisitos),
    correquisitos: '[]',
    probabilidadAprobacion: null,
    riesgo: null,
    factores: null,
  });
  bd.clases.push(clase('MM-211', 'Matemática II', 5, ['MM-110']), clase('IS-210', 'Programación I', 4, []));
  return idSimulacion;
}

// ---------- Aplicación configurada por entorno ----------

const contextos: INestApplicationContext[] = [];

// Arranca el módulo real de Nest (ConfigModule + EstudianteModule) leyendo la
// configuración del entorno, igual que main.ts. Cada llamada equivale a
// reiniciar el backend con otro .env: el código es el mismo. Solo la BD se
// reemplaza, con un módulo global que ocupa el lugar de PrismaModule.
async function arrancarBackend(entorno: Partial<Record<(typeof VARIABLES)[number], string>>) {
  for (const variable of VARIABLES) {
    if (entorno[variable] === undefined) {
      delete process.env[variable];
    } else {
      process.env[variable] = entorno[variable];
    }
  }
  const bd = crearBdEnMemoria();

  @Global()
  @Module({ providers: [{ provide: PrismaService, useValue: bd.prisma }], exports: [PrismaService] })
  class BdEnMemoriaModule {}

  @Module({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), BdEnMemoriaModule, EstudianteModule] })
  class BackendDePruebaModule {}

  const modulo = await NestFactory.createApplicationContext(BackendDePruebaModule, { logger: false });
  contextos.push(modulo);

  const estudiante = modulo.get(EstudianteService);
  const motor = modulo.get(MotorPredictivo);
  // Etapa 1 fuera de alcance: las validaciones previas pasan y la simulación
  // generada se toma de la BD en memoria.
  jest.spyOn(estudiante, 'validarSimulacion').mockResolvedValue({ puedeSimular: true, validaciones: [] });
  jest
    .spyOn(estudiante as unknown as { generarSimulacion: () => Promise<string> }, 'generarSimulacion')
    .mockImplementation(async () => guardarSimulacionGenerada(bd, motor));

  const simular = (): Promise<SimulacionRespuesta> =>
    estudiante.simular(USER_ID, PERIODO.idperiodo, { userId: USER_ID } as RequestUser);
  return { simular, bd, motor };
}

describe('Capa de integración con el motor predictivo — mock y API real intercambiables por configuración', () => {
  const entornoOriginal = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));
  let mock: Awaited<ReturnType<typeof iniciarMock>>;
  let apiReal: Awaited<ReturnType<typeof iniciarStubApiReal>>;

  beforeAll(async () => {
    [mock, apiReal] = await Promise.all([iniciarMock(), iniciarStubApiReal()]);
  });

  afterAll(async () => {
    mock?.proceso.kill();
    await new Promise((r) => (apiReal ? apiReal.servidor.close(r) : r(undefined)));
    for (const variable of VARIABLES) {
      if (entornoOriginal[variable] === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = entornoOriginal[variable];
      }
    }
  });

  beforeEach(() => {
    apiReal.modo('normal');
    apiReal.peticiones.length = 0;
    for (const nivel of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, nivel).mockImplementation(() => undefined);
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(contextos.splice(0).map((c) => c.close()));
  });

  const CONFIG_COMUN = { PREDICTIVE_MODEL_PSEUDONYM_KEY: 'clave-de-pruebas', PREDICTIVE_MODEL_TIMEOUT_MS: '500' };

  it('con PREDICTIVE_MODEL_URL apuntando al mock, simula la carga con el mock', async () => {
    const { simular, bd } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: mock.url });

    const respuesta = await simular();

    expect(respuesta).toMatchObject({ disponible: true, falla: null, estado: EstadoSimulacion.EVALUADA });
    expect(respuesta.versionModelo).toBe('mock-1.3');
    expect(respuesta.clases.map((c) => c.codigo)).toEqual(['IS-210', 'MM-211']);
    for (const c of respuesta.clases) {
      expect(c.probabilidadAprobacion).toBeGreaterThanOrEqual(0);
      expect(c.probabilidadAprobacion).toBeLessThanOrEqual(1);
      expect(['BAJO', 'MEDIO', 'ALTO']).toContain(c.riesgo);
    }
    expect(bd.simulaciones.get(respuesta.idSimulacion)).toMatchObject({ origenModelo: 'mock' });
  });

  it('con PREDICTIVE_MODEL_URL apuntando al API real (stub del contrato), simula la carga con él', async () => {
    const { simular, bd, motor } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });

    const respuesta = await simular();

    expect(respuesta).toMatchObject({
      disponible: true,
      falla: null,
      estado: EstadoSimulacion.EVALUADA,
      versionModelo: 'stub-real-2026.10',
      probabilidadAprobarTodo: 0.62,
      riesgo: 'MEDIO',
      observaciones: ['Observación del modelo real.'],
    });
    // El stub asigna 0.81 a la primera clase de la carga enviada (orden por código).
    expect(respuesta.clases).toEqual([
      expect.objectContaining({ codigo: 'IS-210', probabilidadAprobacion: 0.81, riesgo: 'BAJO' }),
      expect.objectContaining({ codigo: 'MM-211', probabilidadAprobacion: 0.55, riesgo: 'MEDIO' }),
    ]);
    expect(bd.simulaciones.get(respuesta.idSimulacion)).toMatchObject({ origenModelo: 'modelo' });

    // Llegó una solicitud que cumple el contrato, con el seudónimo y no el id real.
    expect(apiReal.peticiones).toHaveLength(1);
    expect(apiReal.peticiones[0].estudiante.idEstudiante).toBe(motor.seudonimoEstudiante(USER_ID));
    expect(JSON.stringify(apiReal.peticiones[0])).not.toContain(USER_ID);
  });

  it('el mismo flujo entrega a la UI la misma forma de respuesta con cualquiera de los dos motores', async () => {
    const conMock = await (await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: mock.url })).simular();
    const conApiReal = await (await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url })).simular();

    const forma = (r: SimulacionRespuesta) => ({
      claves: Object.keys(r).sort(),
      clases: r.clases.map((c) => Object.keys(c).sort()),
    });
    expect(forma(conMock)).toEqual(forma(conApiReal));
  });

  // HU-05-07: la UI avisa que los resultados del mock son ilustrativos.
  it('indica a la UI si el resultado salió del mock o del modelo real', async () => {
    const conMock = await (await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: mock.url })).simular();
    const conApiReal = await (await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url })).simular();

    expect(conMock).toMatchObject({ disponible: true, origenModelo: 'mock' });
    expect(conApiReal).toMatchObject({ disponible: true, origenModelo: 'modelo' });
    expect(conMock.fechaGeneracion).not.toBeNull();
  });

  it('sin PREDICTIVE_MODEL_URL no consulta ningún motor y responde NO_CONFIGURADO', async () => {
    const { simular } = await arrancarBackend({ ...CONFIG_COMUN });

    const respuesta = await simular();

    expect(respuesta).toMatchObject({ disponible: false, falla: 'NO_CONFIGURADO', estado: EstadoSimulacion.NO_EVALUADA });
    expect(apiReal.peticiones).toHaveLength(0);
  });

  it('traduce las fallas del API real a errores de dominio: respuesta inválida y tiempo de espera agotado', async () => {
    const { simular } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });

    apiReal.modo('respuesta_invalida');
    const invalida = await simular();
    apiReal.modo('lento');
    const lenta = await simular();

    expect(invalida).toMatchObject({ disponible: false, falla: 'RESPUESTA_INVALIDA', clases: [] });
    expect(lenta).toMatchObject({ disponible: false, falla: 'TIEMPO_EXCEDIDO', clases: [] });
  });

  // Trazabilidad: los cuerpos exactos de ida y vuelta quedan en la simulación,
  // también cuando la respuesta no cumple el contrato.
  it('guarda la solicitud enviada y la respuesta tal cual llegó', async () => {
    const { simular, bd } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });

    const evaluada = await simular();
    apiReal.modo('respuesta_invalida');
    const invalida = await simular();
    apiReal.modo('lento');
    const lenta = await simular();

    const fila = (id: string) => bd.simulaciones.get(id)!;
    expect(JSON.parse(fila(evaluada.idSimulacion).solicitudJson as string)).toEqual(apiReal.peticiones[0]);
    expect(JSON.parse(fila(evaluada.idSimulacion).respuestaJson as string)).toMatchObject({
      versionModelo: 'stub-real-2026.10',
      probabilidadAprobarTodo: 0.62,
    });
    expect(JSON.parse(fila(invalida.idSimulacion).respuestaJson as string)).toEqual({
      idSolicitud: apiReal.peticiones[1].idSolicitud,
      resultado: 'no cumple el contrato',
    });
    // Sin respuesta que leer: queda la solicitud, no la respuesta.
    expect(JSON.parse(fila(lenta.idSimulacion).solicitudJson as string)).toEqual(apiReal.peticiones[2]);
    expect(fila(lenta.idSimulacion).respuestaJson).toBeNull();
  });

  it('guarda en la simulación el detalle de la falla del motor', async () => {
    const { simular, bd } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });

    const evaluada = await simular();
    apiReal.modo('respuesta_invalida');
    const invalida = await simular();
    apiReal.modo('lento');
    const lenta = await simular();

    expect(bd.simulaciones.get(evaluada.idSimulacion)).toMatchObject({ detalleFalla: null });
    expect(bd.simulaciones.get(invalida.idSimulacion)!.detalleFalla).toMatch(/^contrato: /);
    expect(bd.simulaciones.get(lenta.idSimulacion)).toMatchObject({
      falla: 'TIEMPO_EXCEDIDO',
      detalleFalla: 'sin respuesta en 500 ms',
    });
  });

  // Criterio 3 de trazabilidad: si el guardado del resultado falla, el
  // estudiante recibe igual lo que respondió el modelo y el fallo queda en el log.
  class PrismaClientKnownRequestError extends Error {
    code = 'P1001';
  }
  const fallarGuardado = (bd: ReturnType<typeof crearBdEnMemoria>, estado: EstadoSimulacion) => {
    const update = bd.prisma.simulacion.update;
    jest
      .spyOn(bd.prisma.simulacion, 'update')
      .mockImplementation(async (args) =>
        args.data.estado === estado ? Promise.reject(new PrismaClientKnownRequestError('BD caída')) : update(args),
      );
  };
  const erroresLog = () => (Logger.prototype.error as jest.Mock).mock.calls.map(([m]) => String(m));

  it('si falla el guardado del resultado, el estudiante lo recibe igual y el fallo queda en el log', async () => {
    const { simular, bd } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });
    fallarGuardado(bd, EstadoSimulacion.EVALUADA);

    const respuesta = await simular();

    expect(respuesta).toMatchObject({
      disponible: true,
      estado: EstadoSimulacion.EVALUADA,
      versionModelo: 'stub-real-2026.10',
      probabilidadAprobarTodo: 0.62,
      riesgo: 'MEDIO',
    });
    expect(respuesta.clases).toEqual([
      expect.objectContaining({ codigo: 'IS-210', probabilidadAprobacion: 0.81, riesgo: 'BAJO' }),
      expect.objectContaining({ codigo: 'MM-211', probabilidadAprobacion: 0.55, riesgo: 'MEDIO' }),
    ]);
    // La fila no queda en GENERADA como si siguiera en curso.
    expect(bd.simulaciones.get(respuesta.idSimulacion)).toMatchObject({
      estado: EstadoSimulacion.NO_EVALUADA,
      falla: 'ERROR_INTERNO',
      detalleFalla: 'guardado del resultado: PrismaClientKnownRequestError P1001',
    });
    // El log lleva la respuesta del modelo, pero no la solicitud (historial
    // del estudiante) ni el mensaje del error de Prisma.
    const [linea] = erroresLog().filter((m) => m.startsWith('No se guardó el resultado'));
    expect(linea).toContain(`simulación ${respuesta.idSimulacion}`);
    expect(linea).toContain('PrismaClientKnownRequestError P1001');
    expect(linea).toContain('"versionModelo":"stub-real-2026.10"');
    expect(linea).not.toContain('MM-110');
    expect(linea).not.toContain(USER_ID);
    expect(linea).not.toContain('BD caída');
  });

  it('si falla el guardado de una falla del motor, el estudiante recibe igual el motivo', async () => {
    const { simular, bd } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });
    fallarGuardado(bd, EstadoSimulacion.NO_EVALUADA);
    apiReal.modo('lento');

    const respuesta = await simular();

    expect(respuesta).toMatchObject({ disponible: false, falla: 'TIEMPO_EXCEDIDO' });
    expect(erroresLog().some((m) => m.startsWith('No se guardó el resultado') && m.includes('Respuesta del modelo: n/d'))).toBe(
      true,
    );
  });

  // Un error de SIMULA con la fila ya creada no la deja en GENERADA sin falla.
  it('registra ERROR_INTERNO si la evaluación se interrumpe después de crear la simulación', async () => {
    const { simular, bd, motor } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });
    jest.spyOn(motor, 'evaluarCarga').mockRejectedValueOnce(new TypeError('falla inesperada'));

    await expect(simular()).rejects.toThrow('falla inesperada');

    const [fila] = [...bd.simulaciones.values()];
    expect(fila).toMatchObject({
      estado: EstadoSimulacion.NO_EVALUADA,
      falla: 'ERROR_INTERNO',
      detalleFalla: 'TypeError',
      duracionMs: expect.any(Number),
    });
  });

  it('ERROR_INTERNO no pisa una falla del motor ya guardada', async () => {
    const { simular, bd } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });
    const estudiante = contextos[contextos.length - 1].get(EstudianteService);
    apiReal.modo('respuesta_invalida');
    // Falla el armado de la respuesta, cuando la falla del motor ya está en la fila.
    jest
      .spyOn(estudiante as unknown as { aRespuestaSimulacion: () => SimulacionRespuesta }, 'aRespuestaSimulacion')
      .mockImplementationOnce(() => {
        throw new Error('armado fallido');
      });

    await expect(simular()).rejects.toThrow('armado fallido');

    const [fila] = [...bd.simulaciones.values()];
    expect(fila).toMatchObject({ estado: EstadoSimulacion.NO_EVALUADA, falla: 'RESPUESTA_INVALIDA' });
  });

  // Criterio 4 de trazabilidad: el estudiante consulta sus últimas
  // simulaciones del período actual, también las fallidas.
  it('lista las últimas simulaciones del período actual, de la más reciente a la más antigua', async () => {
    const { simular, bd } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });
    const estudiante = contextos[contextos.length - 1].get(EstudianteService);
    const evaluada = await simular();
    apiReal.modo('respuesta_invalida');
    const fallida = await simular();
    // De otro estudiante: no aparece.
    bd.simulaciones.set('sim-ajena', { ...bd.simulaciones.get(evaluada.idSimulacion)!, idSimulacion: 'sim-ajena', idUser: 'otro' });

    const lista = await estudiante.listarSimulacionesPeriodoActual(USER_ID);

    expect(lista.periodo).toEqual({ id: 'PER-2026-1', anno: '2026', periodo: '1' });
    expect(lista.simulaciones.map((s) => s.idSimulacion)).toEqual([fallida.idSimulacion, evaluada.idSimulacion]);
    expect(lista.simulaciones[0]).toMatchObject({ disponible: false, falla: 'RESPUESTA_INVALIDA', probabilidadAprobarTodo: null });
    expect(lista.simulaciones[1]).toMatchObject({
      disponible: true,
      falla: null,
      probabilidadAprobarTodo: 0.62,
      riesgo: 'MEDIO',
      origenModelo: 'modelo',
      totalUnidadesValorativas: 9,
      clases: [
        { codigo: 'IS-210', nombre: 'Programación I' },
        { codigo: 'MM-211', nombre: 'Matemática II' },
      ],
    });
    expect((await estudiante.listarSimulacionesPeriodoActual(USER_ID, 1)).simulaciones).toHaveLength(1);
  });

  it('sin período actual devuelve la lista vacía', async () => {
    const { simular } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });
    const estudiante = contextos[contextos.length - 1].get(EstudianteService);
    await simular();
    PERIODO.periodoActual = false;
    try {
      expect(await estudiante.listarSimulacionesPeriodoActual(USER_ID)).toEqual({ periodo: null, simulaciones: [] });
    } finally {
      PERIODO.periodoActual = true;
    }
  });

  // HU-05-06, criterio 4: cada intento deja una línea con su duración y su resultado.
  it('registra la duración y el resultado de cada intento de simulación', async () => {
    const { simular, bd } = await arrancarBackend({ ...CONFIG_COMUN, PREDICTIVE_MODEL_URL: apiReal.url });
    const estudiante = contextos[contextos.length - 1].get(EstudianteService);
    const lineas = () =>
      (['log', 'warn', 'error'] as const).flatMap((nivel) =>
        (Logger.prototype[nivel] as jest.Mock).mock.calls
          .map(([mensaje]) => ({ nivel, mensaje: String(mensaje) }))
          .filter(({ mensaje }) => mensaje.startsWith('Simulación resultado=')),
      );

    const exitosa = await simular();
    apiReal.modo('lento');
    const lenta = await simular();
    jest
      .spyOn(estudiante, 'validarSimulacion')
      .mockResolvedValueOnce({ puedeSimular: false, validaciones: [] });
    await expect(simular()).rejects.toThrow('No se puede simular');
    jest
      .spyOn(estudiante as unknown as { generarSimulacion: () => Promise<string> }, 'generarSimulacion')
      .mockRejectedValueOnce(new Error('conexión a la BD perdida'));
    await expect(simular()).rejects.toThrow('conexión a la BD perdida');

    const registradas = lineas();
    expect(registradas.map(({ nivel, mensaje }) => [nivel, mensaje.match(/resultado=(\S+)/)?.[1]])).toEqual([
      ['log', 'EVALUADA'],
      ['warn', 'NO_EVALUADA:TIEMPO_EXCEDIDO'],
      ['warn', 'RECHAZADA:400'],
      ['error', 'ERROR_INESPERADO'],
    ]);
    for (const { mensaje } of registradas) {
      expect(mensaje).toMatch(/duracionMs=\d+ periodo=PER-2026-1 /);
      expect(mensaje).not.toContain(USER_ID);
    }
    expect(registradas[0].mensaje).toContain(`idSimulacion=${exitosa.idSimulacion}`);
    // El timeout del motor es de 500 ms: la duración registrada lo refleja.
    expect(Number(registradas[1].mensaje.match(/duracionMs=(\d+)/)?.[1])).toBeGreaterThanOrEqual(500);
    expect(registradas[3].mensaje).toContain('conexión a la BD perdida');
    // La duración también queda en la simulación, igual a la del log.
    const duracionLog = (i: number) => Number(registradas[i].mensaje.match(/duracionMs=(\d+)/)?.[1]);
    expect(bd.simulaciones.get(exitosa.idSimulacion)).toMatchObject({ duracionMs: duracionLog(0) });
    expect(bd.simulaciones.get(lenta.idSimulacion)).toMatchObject({
      estado: EstadoSimulacion.NO_EVALUADA,
      falla: 'TIEMPO_EXCEDIDO',
      duracionMs: duracionLog(1),
    });
  });
});
