import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatosEvaluacionCarga, DatosRecomendaciones, nuevoControlSolicitud } from './modelo-predictivo.contrato';
import { ModeloPredictivoService } from './modelo-predictivo.service';

// HU-05-03, criterio 4: una solicitud que no cumple el esquema no se envía y
// el error queda registrado.

function crearServicio(extra: Record<string, string> = {}) {
  const config = {
    PREDICTIVE_MODEL_URL: 'http://modelo.test/v1',
    PREDICTIVE_MODEL_PSEUDONYM_KEY: 'clave-de-pruebas',
    ...extra,
  } as Record<string, string>;
  return new ModeloPredictivoService({ get: (clave: string) => config[clave] } as unknown as ConfigService);
}

function datosValidos(servicio: ModeloPredictivoService): DatosEvaluacionCarga {
  return {
    estudiante: {
      idEstudiante: servicio.seudonimoEstudiante('3f2b8c1e-7d4a-4e0b-9c1f-2a6d8e4b5c71'),
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
    },
    historial: [
      {
        codigoClase: 'MM-110',
        nombreClase: 'Matemática I',
        unidadesValorativas: 5,
        nivel: 1,
        obligatoria: true,
        periodo: { anno: '2025', periodo: '1' },
        estado: 'APROBADA',
        nota: 75,
        origen: 'ADMIN',
      },
    ],
    cargaAcademica: {
      periodo: { id: 'PER-2026-1', anno: '2026', periodo: '1' },
      limiteUnidadesValorativas: 25,
      clases: [
        {
          codigoClase: 'MM-211',
          nombreClase: 'Matemática II',
          unidadesValorativas: 5,
          nivel: 2,
          obligatoria: true,
          origen: 'INSCRITA',
          prerrequisitos: ['MM-110'],
          correquisitos: [],
        },
      ],
      totalUnidadesValorativas: 5,
    },
  };
}

describe('ModeloPredictivoService.evaluarCarga — validación previa al envío (HU-05-03)', () => {
  let fetchEspia: jest.SpyInstance;
  let errorEspia: jest.SpyInstance;

  beforeEach(() => {
    fetchEspia = jest.spyOn(global, 'fetch');
    errorEspia = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no envía una solicitud con un dato personal de más y registra el error sin el valor', async () => {
    const servicio = crearServicio();
    const datos = datosValidos(servicio);
    (datos.estudiante as unknown as Record<string, unknown>).correo = 'juan.perez@unah.hn';

    const resultado = await servicio.evaluarCarga(datos, nuevoControlSolicitud());

    expect(resultado).toEqual({
      ok: false,
      falla: 'SOLICITUD_INVALIDA',
      detalle: expect.stringMatching(/^contrato: /),
      origen: null,
      respuestaCruda: null,
    });
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(errorEspia).toHaveBeenCalledTimes(1);
    const mensaje = String(errorEspia.mock.calls[0][0]);
    expect(mensaje).toContain('/estudiante must NOT have additional properties (correo)');
    expect(mensaje).not.toContain('juan.perez@unah.hn');
  });

  it('no envía una solicitud que viola las reglas fuera del esquema (total de U.V.)', async () => {
    const servicio = crearServicio();
    const datos = datosValidos(servicio);
    datos.cargaAcademica.totalUnidadesValorativas = 9;

    const resultado = await servicio.evaluarCarga(datos, nuevoControlSolicitud());

    expect(resultado).toEqual({
      ok: false,
      falla: 'SOLICITUD_INVALIDA',
      detalle: expect.stringMatching(/^contrato: /),
      origen: null,
      respuestaCruda: null,
    });
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(String(errorEspia.mock.calls[0][0])).toContain('/cargaAcademica/totalUnidadesValorativas');
  });

  it('envía una solicitud que cumple el contrato', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    fetchEspia.mockResolvedValue(
      new Response(
        JSON.stringify({
          versionContrato: '1.3',
          idSolicitud: control.idSolicitud,
          versionModelo: 'pruebas',
          probabilidadAprobarTodo: 0.8,
          clases: [{ codigoClase: 'MM-211', probabilidadAprobacion: 0.8, factores: [] }],
          observaciones: [],
        }),
        { status: 200 },
      ),
    );

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado.ok).toBe(true);
    expect(fetchEspia).toHaveBeenCalledTimes(1);
    expect(errorEspia).not.toHaveBeenCalled();
  });
});

describe('ModeloPredictivoService — trazabilidad del origen de la respuesta', () => {
  let fetchEspia: jest.SpyInstance;
  let logEspia: jest.SpyInstance;
  let warnEspia: jest.SpyInstance;

  beforeEach(() => {
    fetchEspia = jest.spyOn(global, 'fetch');
    logEspia = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnEspia = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function respuestaValida(idSolicitud: string, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
      versionContrato: '1.3',
      idSolicitud,
      versionModelo: 'pruebas',
      probabilidadAprobarTodo: 0.8,
      clases: [{ codigoClase: 'MM-211', probabilidadAprobacion: 0.8, factores: [] }],
      observaciones: [],
      ...extra,
    });
  }

  it('registra origen mock cuando la respuesta trae "source": "mock"', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    fetchEspia.mockResolvedValue(new Response(respuestaValida(control.idSolicitud, { source: 'mock' }), { status: 200 }));

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toMatchObject({ ok: true, origen: 'mock' });
    expect(String(logEspia.mock.calls[0][0])).toContain(`idSolicitud ${control.idSolicitud}, origen mock`);
  });

  it('asume el modelo real cuando la respuesta no trae marca de origen', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    fetchEspia.mockResolvedValue(new Response(respuestaValida(control.idSolicitud), { status: 200 }));

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toMatchObject({ ok: true, origen: 'modelo' });
    expect(String(logEspia.mock.calls[0][0])).toContain('origen modelo');
  });

  it('entrega el cuerpo tal cual llegó, con los campos que el contrato no recoge', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    const cuerpo = respuestaValida(control.idSolicitud, { metricas: { auc: 0.91 } });
    fetchEspia.mockResolvedValue(new Response(cuerpo, { status: 200 }));

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toMatchObject({ ok: true, respuestaCruda: cuerpo });
    expect(resultado.ok && resultado.respuesta).not.toHaveProperty('metricas');
  });

  it('no guarda texto arbitrario: un X-Source distinto de "mock" cuenta como modelo', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    fetchEspia.mockResolvedValue(
      new Response(respuestaValida(control.idSolicitud), { status: 200, headers: { 'X-Source': 'x'.repeat(100) } }),
    );

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toMatchObject({ ok: true, origen: 'modelo' });
  });

  it('registra el origen también en errores HTTP y en cuerpos que no son JSON', async () => {
    const servicio = crearServicio();
    fetchEspia.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { codigo: 'ERROR_INTERNO' }, source: 'mock' }), { status: 500 }),
    );
    fetchEspia.mockResolvedValueOnce(new Response('<html>', { status: 200, headers: { 'X-Source': 'mock' } }));

    const conError = await servicio.evaluarCarga(datosValidos(servicio), nuevoControlSolicitud());
    const malformada = await servicio.evaluarCarga(datosValidos(servicio), nuevoControlSolicitud());

    expect(conError).toEqual({
      ok: false,
      falla: 'NO_DISPONIBLE',
      detalle: 'HTTP 500 ERROR_INTERNO',
      origen: 'mock',
      respuestaCruda: JSON.stringify({ error: { codigo: 'ERROR_INTERNO' }, source: 'mock' }),
    });
    expect(malformada).toEqual({
      ok: false,
      falla: 'RESPUESTA_INVALIDA',
      detalle: expect.stringMatching(/^contrato: /),
      origen: 'mock',
      respuestaCruda: '<html>',
    });
    expect(String(warnEspia.mock.calls[0][0])).toMatch(/respondió 500 ERROR_INTERNO .*origen mock/);
    expect(String(warnEspia.mock.calls[1][0])).toMatch(/no cumple el contrato v1\.3 .*origen mock/);
  });
});

describe('ModeloPredictivoService — tiempo máximo de espera y errores de dominio', () => {
  let fetchEspia: jest.SpyInstance;
  let warnEspia: jest.SpyInstance;

  beforeEach(() => {
    fetchEspia = jest.spyOn(global, 'fetch');
    warnEspia = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Responde como el motor, pero solo cuando se le aborta la señal (o nunca).
  function motorQueNoResponde(): (url: string, init: RequestInit) => Promise<Response> {
    return (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('This operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
  }

  function respuesta(idSolicitud: string, extra: Record<string, unknown> = {}): Response {
    return new Response(
      JSON.stringify({
        versionContrato: '1.3',
        idSolicitud,
        versionModelo: 'pruebas',
        probabilidadAprobarTodo: 0.8,
        clases: [{ codigoClase: 'MM-211', probabilidadAprobacion: 0.8, factores: [] }],
        observaciones: [],
        ...extra,
      }),
      { status: 200 },
    );
  }

  it('aborta la llamada al cumplirse PREDICTIVE_MODEL_TIMEOUT_MS y la reporta como TIEMPO_EXCEDIDO', async () => {
    const servicio = crearServicio({ PREDICTIVE_MODEL_TIMEOUT_MS: '20' });
    fetchEspia.mockImplementation(motorQueNoResponde());

    const inicio = Date.now();
    const resultado = await servicio.evaluarCarga(datosValidos(servicio), nuevoControlSolicitud());

    expect(resultado).toEqual({
      ok: false,
      falla: 'TIEMPO_EXCEDIDO',
      detalle: expect.stringMatching(/^sin respuesta en \d+ ms$/),
      origen: null,
      respuestaCruda: null,
    });
    expect(Date.now() - inicio).toBeLessThan(1000);
    expect(String(warnEspia.mock.calls[0][0])).toContain('sin respuesta en 20 ms');
  });

  it.each(['', 'abc', '0', '-5', '1.5'])(
    'con PREDICTIVE_MODEL_TIMEOUT_MS="%s" usa 3000 ms en vez de abortar de inmediato',
    async (valor) => {
      const servicio = crearServicio({ PREDICTIVE_MODEL_TIMEOUT_MS: valor });
      const control = nuevoControlSolicitud();
      fetchEspia.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return respuesta(control.idSolicitud);
      });

      const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

      expect(resultado.ok).toBe(true);
    },
  );

  it('traduce un 422 a CARRERA_NO_SOPORTADA y un 500 o un error de red a NO_DISPONIBLE', async () => {
    const servicio = crearServicio();
    fetchEspia.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { codigo: 'CARRERA_NO_SOPORTADA' } }), { status: 422 }),
    );
    fetchEspia.mockResolvedValueOnce(new Response('', { status: 500 }));
    fetchEspia.mockRejectedValueOnce(new TypeError('fetch failed'));

    const fallas = [];
    for (let i = 0; i < 3; i++) {
      const r = await servicio.evaluarCarga(datosValidos(servicio), nuevoControlSolicitud());
      fallas.push(r.ok ? null : [r.falla, r.detalle]);
    }

    // `detalle` distingue los casos que comparten la misma falla de dominio.
    expect(fallas).toEqual([
      ['CARRERA_NO_SOPORTADA', 'HTTP 422 CARRERA_NO_SOPORTADA'],
      ['NO_DISPONIBLE', 'HTTP 500'],
      ['NO_DISPONIBLE', 'red: fetch failed'],
    ]);
  });

  it('recorta el detalle de la falla al largo de la columna', async () => {
    const servicio = crearServicio();
    fetchEspia.mockResolvedValue(
      new Response(JSON.stringify({ error: { codigo: 'X'.repeat(500) } }), { status: 503 }),
    );

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), nuevoControlSolicitud());

    expect(resultado.ok).toBe(false);
    const detalle = resultado.ok ? '' : resultado.detalle!;
    expect(detalle).toHaveLength(255);
    expect(detalle.startsWith('HTTP 503 XXX')).toBe(true);
  });

  it.each([
    ['no evalúa una clase de la carga', { clases: [] }],
    ['evalúa una clase ajena a la carga', { clases: [{ codigoClase: 'XX-999', probabilidadAprobacion: 0.5, factores: [] }] }],
    ['trae una probabilidad fuera de [0, 1]', { probabilidadAprobarTodo: 1.7 }],
    ['corresponde a otra solicitud', { idSolicitud: 'otra' }],
  ])('responde RESPUESTA_INVALIDA cuando el motor %s', async (_caso, extra) => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    fetchEspia.mockResolvedValue(respuesta(control.idSolicitud, extra));

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toEqual({
      ok: false,
      falla: 'RESPUESTA_INVALIDA',
      detalle: expect.stringMatching(/^contrato: /),
      origen: 'modelo',
      respuestaCruda: expect.any(String),
    });
  });
});

describe('ModeloPredictivoService — validación de la respuesta contra el contrato v1.3', () => {
  let fetchEspia: jest.SpyInstance;
  let warnEspia: jest.SpyInstance;

  beforeEach(() => {
    fetchEspia = jest.spyOn(global, 'fetch');
    warnEspia = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function cuerpoEvaluacion(idSolicitud: string, extra: Record<string, unknown> = {}) {
    return {
      versionContrato: '1.3',
      idSolicitud,
      versionModelo: 'pruebas',
      probabilidadAprobarTodo: 0.8,
      clases: [{ codigoClase: 'MM-211', probabilidadAprobacion: 0.8, factores: [] }],
      ...extra,
    };
  }

  function datosRecomendaciones(servicio: ModeloPredictivoService): DatosRecomendaciones {
    const { estudiante, historial } = datosValidos(servicio);
    const candidata = (codigoClase: string, unidadesValorativas: number) => ({
      codigoClase,
      nombreClase: null,
      unidadesValorativas,
      nivel: 2,
      obligatoria: true,
      inscritaEnPeriodo: false,
      prerrequisitos: [],
      correquisitos: [],
    });
    return {
      estudiante,
      historial,
      cargaActual: null,
      limiteUnidadesValorativas: 8,
      clasesCandidatas: [candidata('MM-211', 5), candidata('IS-210', 3), candidata('FS-100', 4)],
    };
  }

  function cuerpoRecomendaciones(clases: string[], extra: Record<string, unknown> = {}) {
    // El idSolicitud lo genera el adaptador: se toma de la petición enviada.
    return (_url: string, init: RequestInit) => {
      const { idSolicitud } = JSON.parse(String(init.body)) as { idSolicitud: string };
      return Promise.resolve(
        new Response(
          JSON.stringify({
            versionContrato: '1.3',
            idSolicitud,
            versionModelo: 'pruebas',
            probabilidadAprobarTodo: clases.length > 0 ? 0.7 : null,
            clases: clases.map((codigoClase) => ({ codigoClase, probabilidadAprobacion: 0.7, factores: [] })),
            ...extra,
          }),
          { status: 200 },
        ),
      );
    };
  }

  it('rechaza una respuesta de otra versión del contrato y registra la regla incumplida', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    fetchEspia.mockResolvedValue(
      new Response(JSON.stringify(cuerpoEvaluacion(control.idSolicitud, { versionContrato: '1.2' })), { status: 200 }),
    );

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toEqual({
      ok: false,
      falla: 'RESPUESTA_INVALIDA',
      detalle: expect.stringMatching(/^contrato: /),
      origen: 'modelo',
      respuestaCruda: expect.any(String),
    });
    expect(String(warnEspia.mock.calls[0][0])).toContain('/versionContrato must be equal to constant');
  });

  it('rechaza una respuesta sin un campo obligatorio', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    const cuerpo: Record<string, unknown> = cuerpoEvaluacion(control.idSolicitud);
    delete cuerpo.versionModelo;
    fetchEspia.mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: 200 }));

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toMatchObject({ ok: false, falla: 'RESPUESTA_INVALIDA' });
    expect(String(warnEspia.mock.calls[0][0])).toContain("must have required property 'versionModelo'");
  });

  it('acepta campos desconocidos pero no los entrega a la aplicación (ni el riesgo del modelo, D5)', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    fetchEspia.mockResolvedValue(
      new Response(
        JSON.stringify(
          cuerpoEvaluacion(control.idSolicitud, {
            riesgo: 'ALTO',
            clases: [{ codigoClase: 'MM-211', probabilidadAprobacion: 0.8, factores: [], riesgo: 'BAJO' }],
          }),
        ),
        { status: 200 },
      ),
    );

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado.ok && resultado.respuesta).toEqual({
      versionContrato: '1.3',
      idSolicitud: control.idSolicitud,
      versionModelo: 'pruebas',
      probabilidadAprobarTodo: 0.8,
      clases: [{ codigoClase: 'MM-211', probabilidadAprobacion: 0.8, factores: [] }],
      observaciones: [],
    });
  });

  it('entrega una recomendación válida normalizada (motivo y observaciones por defecto)', async () => {
    const servicio = crearServicio();
    fetchEspia.mockImplementation(cuerpoRecomendaciones(['MM-211', 'IS-210']));

    const resultado = await servicio.recomendar(datosRecomendaciones(servicio));

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.respuesta.clases.map((c) => [c.codigoClase, c.motivo])).toEqual([
        ['MM-211', null],
        ['IS-210', null],
      ]);
      expect(resultado.respuesta.observaciones).toEqual([]);
    }
  });

  it('acepta una recomendación vacía con probabilidadAprobarTodo en null', async () => {
    const servicio = crearServicio();
    fetchEspia.mockImplementation(cuerpoRecomendaciones([]));

    const resultado = await servicio.recomendar(datosRecomendaciones(servicio));

    expect(resultado).toMatchObject({ ok: true, respuesta: { clases: [], probabilidadAprobarTodo: null } });
  });

  it.each([
    ['incluye una clase fuera de clasesCandidatas', ['MM-211', 'XX-999'], {}, 'must be one of clasesCandidatas'],
    ['repite una clase', ['IS-210', 'IS-210'], {}, 'must NOT be repeated'],
    ['supera el tope de U.V.', ['MM-211', 'FS-100'], {}, 'must NOT exceed limiteUnidadesValorativas'],
    ['trae clases sin probabilidadAprobarTodo', ['MM-211'], { probabilidadAprobarTodo: null }, '/probabilidadAprobarTodo'],
  ])('rechaza una recomendación que %s', async (_caso, clases, extra, regla) => {
    const servicio = crearServicio();
    fetchEspia.mockImplementation(cuerpoRecomendaciones(clases, extra));

    const resultado = await servicio.recomendar(datosRecomendaciones(servicio));

    expect(resultado).toEqual({
      ok: false,
      falla: 'RESPUESTA_INVALIDA',
      detalle: expect.stringMatching(/^contrato: /),
      origen: 'modelo',
      respuestaCruda: expect.any(String),
    });
    expect(String(warnEspia.mock.calls[0][0])).toContain(regla);
  });
});

describe('ModeloPredictivoService — probabilidades con más de 2 decimales', () => {
  let fetchEspia: jest.SpyInstance;
  let warnEspia: jest.SpyInstance;

  beforeEach(() => {
    fetchEspia = jest.spyOn(global, 'fetch');
    warnEspia = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function responder(idSolicitud: string, probabilidadAprobarTodo: number, probabilidadAprobacion: number) {
    fetchEspia.mockResolvedValue(
      new Response(
        JSON.stringify({
          versionContrato: '1.3',
          idSolicitud,
          versionModelo: 'pruebas',
          probabilidadAprobarTodo,
          clases: [{ codigoClase: 'MM-211', probabilidadAprobacion, factores: [] }],
        }),
        { status: 200 },
      ),
    );
  }

  it('las redondea a 2 decimales (0.748 → 0.75, para que riesgo y porcentaje coincidan) y lo avisa', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    responder(control.idSolicitud, 0.6951, 0.748);

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toMatchObject({
      ok: true,
      respuesta: { probabilidadAprobarTodo: 0.7, clases: [{ codigoClase: 'MM-211', probabilidadAprobacion: 0.75 }] },
    });
    expect(warnEspia).toHaveBeenCalledTimes(1);
    expect(String(warnEspia.mock.calls[0][0])).toContain(
      `2 probabilidad(es) con más de 2 decimales, fuera del contrato v1.3; se redondearon (idSolicitud ${control.idSolicitud}`,
    );
  });

  it('no avisa cuando cumplen el contrato (incluido 0.29, que en coma flotante no es múltiplo exacto de 0.01)', async () => {
    const servicio = crearServicio();
    const control = nuevoControlSolicitud();
    responder(control.idSolicitud, 0.29, 0.5);

    const resultado = await servicio.evaluarCarga(datosValidos(servicio), control);

    expect(resultado).toMatchObject({
      ok: true,
      respuesta: { probabilidadAprobarTodo: 0.29, clases: [{ probabilidadAprobacion: 0.5 }] },
    });
    expect(warnEspia).not.toHaveBeenCalled();
  });
});
