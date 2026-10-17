import { createHmac, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Ajv2020, { ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import * as esquemaRespuestaEvaluacionCarga from './contrato-v1.3/respuesta-evaluacion-carga.schema.json';
import * as esquemaRespuestaRecomendaciones from './contrato-v1.3/respuesta-recomendaciones.schema.json';
import * as esquemaSolicitudEvaluacionCarga from './contrato-v1.3/solicitud-evaluacion-carga.schema.json';
import {
  CamposControlSolicitud,
  DatosEvaluacionCarga,
  DatosRecomendaciones,
  RespuestaEvaluacionCarga,
  RespuestaRecomendaciones,
  SolicitudEvaluacionCarga,
  VERSION_CONTRATO_MODELO,
  nuevoControlSolicitud,
} from './modelo-predictivo.contrato';
import {
  FallaPrediccion,
  MotorPredictivo,
  OrigenModelo,
  ResultadoModelo,
  recortarDetalleFalla,
} from './motor-predictivo';

// HU-05-03: los esquemas JSON de contrato-v1.3/ son la fuente de verdad del
// contrato, tanto de lo que SIMULA envía como de lo que acepta de vuelta; se
// compilan una sola vez al cargar el módulo.
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validarEsquemaEvaluacionCarga = ajv.compile<SolicitudEvaluacionCarga>(esquemaSolicitudEvaluacionCarga);
const validarEsquemaRespuestaEvaluacionCarga = ajv.compile<RespuestaEvaluacionCarga>(esquemaRespuestaEvaluacionCarga);
const validarEsquemaRespuestaRecomendaciones = ajv.compile<RespuestaRecomendaciones>(esquemaRespuestaRecomendaciones);

// Resultado de validar una respuesta: la respuesta normalizada (solo los
// campos del contrato) o la lista de reglas que no cumple.
// `redondeadas`: probabilidades que traían más de 2 decimales.
type ValidacionRespuesta<T> = { respuesta: T; redondeadas: number } | { errores: string[] };

// El contrato fija probabilidades con máximo 2 decimales. Si el motor manda
// más, no se rechaza la respuesta (la predicción sigue siendo válida): se
// redondea para que el riesgo, el porcentaje que ve el estudiante y lo que se
// guarda en la BD salgan del mismo número (con 0.748 la UI mostraría
// "75% · Riesgo medio"). Se cuenta cuántas se ajustaron para avisarlo.
function redondeadorProbabilidades() {
  let redondeadas = 0;
  return {
    redondear(probabilidad: number): number {
      const redondeada = Math.round(probabilidad * 100) / 100;
      if (redondeada !== probabilidad) {
        redondeadas++;
      }
      return redondeada;
    },
    get redondeadas() {
      return redondeadas;
    },
  };
}

// Ruta y regla de cada error, nunca el valor: los mensajes van al log.
function erroresEsquema(validar: ValidateFunction): string[] {
  return (validar.errors ?? []).map((e) => {
    const ruta = e.instancePath || '/';
    // Nombre del campo sobrante (no su valor): ayuda a ver qué se coló.
    const extra = e.keyword === 'additionalProperties' ? ` (${String(e.params.additionalProperty)})` : '';
    return `${ruta} ${e.message ?? e.keyword}${extra}`;
  });
}

// D4 (docs/modelo-predictivo/03-decisiones-contrato.md): dos endpoints sobre una
// sola URL base; las rutas son parte del contrato, por eso no van en .env.
const RUTA_RECOMENDACIONES = 'recomendaciones';
const RUTA_EVALUACION_CARGA = 'evaluacion-carga';

const TIMEOUT_POR_DEFECTO_MS = 3000;

// HU-04-01: el modelo predictivo en sí está fuera de nuestro alcance, pero el
// sitio debe quedar listo para consumirlo. Esta es la implementación HTTP de
// MotorPredictivo: sirve igual para el mock (mock-modelo-predictivo/) que para
// el API real, porque ambos cumplen el mismo contrato y solo cambia
// PREDICTIVE_MODEL_URL. Solo habla HTTP con el motor y valida sus respuestas;
// el fallback local (cuando no hay URL configurada) lo decide
// EstudianteService a partir de `NO_CONFIGURADO`. Si
// la URL SÍ está configurada y falla, se reporta como falla (no se disfraza
// de fallback) para que la UI pueda distinguir "no disponible" de
// "recomendación real".
@Injectable()
export class ModeloPredictivoService implements MotorPredictivo {
  private readonly logger = new Logger(ModeloPredictivoService.name);
  private readonly claveSeudonimo: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.timeoutMs = this.leerTimeoutMs();

    const clave = this.config.get<string>('PREDICTIVE_MODEL_PSEUDONYM_KEY');
    if (clave) {
      this.claveSeudonimo = clave;
    } else {
      // Sin clave configurada se usa una aleatoria: nunca se envía el id
      // real, pero el seudónimo de un estudiante cambia al reiniciar.
      this.claveSeudonimo = randomBytes(32).toString('hex');
      this.logger.warn(
        'PREDICTIVE_MODEL_PSEUDONYM_KEY no está configurada: se usa una clave temporal y los seudónimos cambiarán al reiniciar.',
      );
    }
  }

  estaConfigurado(): boolean {
    return !!this.config.get<string>('PREDICTIVE_MODEL_URL');
  }

  // v1.1: la recomendación es una carga completa con probabilidades. A
  // diferencia de la v1.0, una clase fuera de `clasesCandidatas` ya no se
  // descarta en silencio: la probabilidad de aprobar todo se calculó con esa
  // clase dentro, así que sin ella el número no correspondería a lo que se
  // muestra. Cualquier inconsistencia invalida la respuesta completa.
  async recomendar(datos: DatosRecomendaciones): Promise<ResultadoModelo<RespuestaRecomendaciones>> {
    return this.llamar(RUTA_RECOMENDACIONES, datos, (cuerpo, idSolicitud) =>
      this.validarRecomendaciones(cuerpo, idSolicitud, datos),
    );
  }

  async evaluarCarga(
    datos: DatosEvaluacionCarga,
    control: CamposControlSolicitud,
  ): Promise<ResultadoModelo<RespuestaEvaluacionCarga>> {
    // HU-05-03: una solicitud que no cumple el contrato no sale de SIMULA,
    // vaya al mock o al modelo real. Se registran la ruta y la regla de cada
    // error, nunca los valores, para no dejar datos del estudiante en el log.
    const errores = ModeloPredictivoService.erroresSolicitudEvaluacionCarga({ ...control, ...datos });
    if (errores.length > 0) {
      this.logger.error(
        `Solicitud a /${RUTA_EVALUACION_CARGA} no cumple el contrato v${VERSION_CONTRATO_MODELO}; no se envió ` +
          `(idSolicitud ${control.idSolicitud}): ${errores.join('; ')}`,
      );
      return {
        ok: false,
        falla: 'SOLICITUD_INVALIDA',
        detalle: recortarDetalleFalla(`contrato: ${errores.join('; ')}`),
        origen: null,
        respuestaCruda: null,
      };
    }

    const codigosCarga = datos.cargaAcademica.clases.map((c) => c.codigoClase);
    return this.llamar(
      RUTA_EVALUACION_CARGA,
      datos,
      (cuerpo, idSolicitud) => this.validarEvaluacionCarga(cuerpo, idSolicitud, codigosCarga),
      control,
    );
  }

  // v1.3 (HU-05-03): el modelo recibe un seudónimo en vez de User.idUser.
  // HMAC-SHA256 con una clave que solo conoce SIMULA: es estable para el
  // mismo estudiante, pero sin la clave no se puede volver al id ni cruzar
  // con otros datos institucionales.
  seudonimoEstudiante(idUser: string): string {
    return createHmac('sha256', this.claveSeudonimo).update(idUser).digest('hex');
  }

  // Lista vacía = cumple. Además del esquema, revisa las dos reglas que JSON
  // Schema no puede expresar: códigos sin repetir y total de U.V. = suma.
  static erroresSolicitudEvaluacionCarga(solicitud: unknown): string[] {
    if (!validarEsquemaEvaluacionCarga(solicitud)) {
      return erroresEsquema(validarEsquemaEvaluacionCarga);
    }
    const { clases, totalUnidadesValorativas } = solicitud.cargaAcademica;
    const errores: string[] = [];
    const codigos = new Set(clases.map((c) => c.codigoClase));
    if (codigos.size !== clases.length) {
      errores.push('/cargaAcademica/clases must NOT have duplicate codigoClase');
    }
    const suma = clases.reduce((total, c) => total + c.unidadesValorativas, 0);
    if (suma !== totalUnidadesValorativas) {
      errores.push('/cargaAcademica/totalUnidadesValorativas must equal the sum of clases[].unidadesValorativas');
    }
    return errores;
  }

  // ---------- Llamada HTTP común a ambos endpoints ----------

  // Sin reintentos: la llamada ocurre mientras el estudiante espera en la
  // pantalla, y un reintento duplicaría el tiempo de espera ante un timeout.
  private async llamar<T>(
    ruta: string,
    datos: object,
    validar: (cuerpo: unknown, idSolicitud: string) => ValidacionRespuesta<T>,
    control: CamposControlSolicitud = nuevoControlSolicitud(),
  ): Promise<ResultadoModelo<T>> {
    const url = this.construirUrl(ruta);
    if (!url) {
      return { ok: false, falla: 'NO_CONFIGURADO', detalle: null, origen: null, respuestaCruda: null };
    }

    const { idSolicitud } = control;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.cabeceras(),
        body: JSON.stringify({ ...control, ...datos }),
        signal: controller.signal,
      });

      // El cuerpo se lee una sola vez y como texto: un error o una
      // respuesta malformada pueden no ser JSON, y aun así se registra su origen.
      const respuestaCruda = await response.text();
      const cuerpo = ModeloPredictivoService.parsearJson(respuestaCruda);
      const origen = ModeloPredictivoService.origenRespuesta(response, cuerpo);

      if (!response.ok) {
        const { falla, detalle } = this.registrarError(ruta, idSolicitud, origen, response, cuerpo);
        return { ok: false, falla, detalle, origen, respuestaCruda };
      }

      // La respuesta no llega a la aplicación (ni a la UI) sin cumplir el contrato.
      const validacion = validar(cuerpo, idSolicitud);
      if ('errores' in validacion) {
        this.logger.warn(
          `Modelo predictivo (/${ruta}) respondió un cuerpo que no cumple el contrato v${VERSION_CONTRATO_MODELO} ` +
            `(idSolicitud ${idSolicitud}, origen ${origen}): ${validacion.errores.join('; ')}`,
        );
        return {
          ok: false,
          falla: 'RESPUESTA_INVALIDA',
          detalle: recortarDetalleFalla(`contrato: ${validacion.errores.join('; ')}`),
          origen,
          respuestaCruda,
        };
      }
      if (validacion.redondeadas > 0) {
        this.logger.warn(
          `Modelo predictivo (/${ruta}) envió ${validacion.redondeadas} probabilidad(es) con más de 2 decimales, ` +
            `fuera del contrato v${VERSION_CONTRATO_MODELO}; se redondearon (idSolicitud ${idSolicitud}, origen ${origen}).`,
        );
      }
      this.logger.log(`Modelo predictivo (/${ruta}) respondió ${response.status} (idSolicitud ${idSolicitud}, origen ${origen}).`);
      return { ok: true, respuesta: validacion.respuesta, origen, respuestaCruda };
    } catch (error) {
      const agotado = (error as Error).name === 'AbortError';
      const motivo = agotado ? `sin respuesta en ${this.timeoutMs} ms` : (error as Error).message;
      this.logger.warn(`No se pudo consultar el modelo predictivo (/${ruta}, idSolicitud ${idSolicitud}): ${motivo}`);
      return {
        ok: false,
        falla: agotado ? 'TIEMPO_EXCEDIDO' : 'NO_DISPONIBLE',
        detalle: recortarDetalleFalla(agotado ? motivo : `red: ${motivo}`),
        origen: null,
        respuestaCruda: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // 400/401/403 indican un defecto de nuestro lado (petición o configuración),
  // por eso van como error y no como warning (§4.2 de la propuesta).
  // `detalle` (estado HTTP y código de error del motor) distingue en la BD
  // los casos que comparten la misma falla de dominio.
  private registrarError(
    ruta: string,
    idSolicitud: string,
    origen: string,
    response: Response,
    cuerpo: unknown,
  ): { falla: FallaPrediccion; detalle: string } {
    const error = this.esObjeto(cuerpo) && this.esObjeto(cuerpo.error) ? cuerpo.error : null;
    const codigoError = typeof error?.codigo === 'string' ? error.codigo : null;
    const detalleHttp = recortarDetalleFalla(`HTTP ${response.status}${codigoError ? ` ${codigoError}` : ''}`);
    const linea = `Modelo predictivo (/${ruta}) respondió ${response.status}${codigoError ? ` ${codigoError}` : ''} (idSolicitud ${idSolicitud}, origen ${origen})`;

    if ([400, 401, 403].includes(response.status)) {
      this.logger.error(`${linea}.`);
      return { falla: 'NO_DISPONIBLE', detalle: detalleHttp };
    }
    if (response.status === 422) {
      this.logger.warn(`${linea}: carrera o malla no soportada por el modelo.`);
      return { falla: 'CARRERA_NO_SOPORTADA', detalle: detalleHttp };
    }
    if (response.status === 429) {
      this.logger.warn(`${linea}: límite excedido (Retry-After: ${response.headers.get('Retry-After') ?? 'n/d'}).`);
      return { falla: 'NO_DISPONIBLE', detalle: detalleHttp };
    }
    this.logger.warn(`${linea}.`);
    return { falla: 'NO_DISPONIBLE', detalle: detalleHttp };
  }

  private static parsearJson(texto: string): unknown {
    try {
      return JSON.parse(texto);
    } catch {
      return null;
    }
  }

  // Trazabilidad: el mock marca cada respuesta con la cabecera X-Source y el
  // campo "source" (ver mock-modelo-predictivo/servidor.mjs). El contrato no
  // los exige, así que una respuesta sin marca "mock" se asume del modelo
  // real. Se normaliza a dos valores para no guardar texto arbitrario del
  // servicio externo en la base de datos.
  private static origenRespuesta(response: Response, cuerpo: unknown): OrigenModelo {
    const source = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { source?: unknown }).source : undefined;
    return response.headers.get('X-Source') === 'mock' || source === 'mock' ? 'mock' : 'modelo';
  }

  // ---------- Validación de respuestas contra el contrato ----------

  // Primero el esquema (forma, tipos, rangos, versión del contrato); después
  // las reglas que dependen de la solicitud y que el esquema no puede
  // expresar. Los campos desconocidos se ignoran: no pasan a la respuesta.

  // Además, exige que la carga recomendada sea armable: solo clases
  // candidatas, sin repetidas y dentro del tope de U.V.
  private validarRecomendaciones(
    cuerpo: unknown,
    idSolicitud: string,
    datos: DatosRecomendaciones,
  ): ValidacionRespuesta<RespuestaRecomendaciones> {
    if (!validarEsquemaRespuestaRecomendaciones(cuerpo)) {
      return { errores: erroresEsquema(validarEsquemaRespuestaRecomendaciones) };
    }
    const errores = ModeloPredictivoService.erroresEco(cuerpo, idSolicitud);

    const uvPorCodigo = new Map(datos.clasesCandidatas.map((c) => [c.codigoClase, c.unidadesValorativas]));
    const vistas = new Set<string>();
    let totalUv = 0;
    cuerpo.clases.forEach((c, i) => {
      if (!uvPorCodigo.has(c.codigoClase)) {
        errores.push(`/clases/${i}/codigoClase must be one of clasesCandidatas`);
      } else if (vistas.has(c.codigoClase)) {
        errores.push(`/clases/${i}/codigoClase must NOT be repeated`);
      } else {
        totalUv += uvPorCodigo.get(c.codigoClase)!;
      }
      vistas.add(c.codigoClase);
    });
    if (totalUv > datos.limiteUnidadesValorativas) {
      errores.push('/clases must NOT exceed limiteUnidadesValorativas');
    }
    if (errores.length > 0) {
      return { errores };
    }

    const redondeo = redondeadorProbabilidades();
    const respuesta: RespuestaRecomendaciones = {
      versionContrato: cuerpo.versionContrato,
      idSolicitud,
      versionModelo: cuerpo.versionModelo,
      probabilidadAprobarTodo:
        cuerpo.clases.length === 0 || cuerpo.probabilidadAprobarTodo === null
          ? null
          : redondeo.redondear(cuerpo.probabilidadAprobarTodo),
      clases: cuerpo.clases.map((c) => ({
        codigoClase: c.codigoClase,
        probabilidadAprobacion: redondeo.redondear(c.probabilidadAprobacion),
        factores: c.factores,
        motivo: c.motivo ?? null,
      })),
      observaciones: cuerpo.observaciones ?? [],
    };
    return { respuesta, redondeadas: redondeo.redondeadas };
  }

  // Además, exige exactamente una evaluación por cada clase de la carga
  // enviada: una clase faltante o un código ajeno dejaría a la UI mostrando
  // probabilidades que no corresponden a lo que el estudiante armó.
  private validarEvaluacionCarga(
    cuerpo: unknown,
    idSolicitud: string,
    codigosCarga: string[],
  ): ValidacionRespuesta<RespuestaEvaluacionCarga> {
    if (!validarEsquemaRespuestaEvaluacionCarga(cuerpo)) {
      return { errores: erroresEsquema(validarEsquemaRespuestaEvaluacionCarga) };
    }
    const errores = ModeloPredictivoService.erroresEco(cuerpo, idSolicitud);

    const pendientes = new Set(codigosCarga);
    cuerpo.clases.forEach((c, i) => {
      if (!pendientes.delete(c.codigoClase)) {
        errores.push(`/clases/${i}/codigoClase must be a class of the carga sent, not repeated`);
      }
    });
    if (pendientes.size > 0) {
      errores.push(`/clases must include every class of the carga sent (missing ${pendientes.size})`);
    }
    if (errores.length > 0) {
      return { errores };
    }

    const redondeo = redondeadorProbabilidades();
    const respuesta: RespuestaEvaluacionCarga = {
      versionContrato: cuerpo.versionContrato,
      idSolicitud,
      versionModelo: cuerpo.versionModelo,
      probabilidadAprobarTodo: redondeo.redondear(cuerpo.probabilidadAprobarTodo),
      clases: cuerpo.clases.map((c) => ({
        codigoClase: c.codigoClase,
        probabilidadAprobacion: redondeo.redondear(c.probabilidadAprobacion),
        factores: c.factores,
      })),
      observaciones: cuerpo.observaciones ?? [],
    };
    return { respuesta, redondeadas: redondeo.redondeadas };
  }

  // La respuesta debe corresponder a la solicitud que se envió.
  private static erroresEco(cuerpo: { idSolicitud: string }, idSolicitud: string): string[] {
    return cuerpo.idSolicitud === idSolicitud ? [] : ['/idSolicitud must equal the idSolicitud sent'];
  }

  private esObjeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
  }

  // ---------- Configuración (.env) ----------

  // PREDICTIVE_MODEL_URL es la URL BASE (D8); se tolera que termine en "/".
  private construirUrl(ruta: string): string | null {
    const base = this.config.get<string>('PREDICTIVE_MODEL_URL');
    return base ? `${base.replace(/\/+$/, '')}/${ruta}` : null;
  }

  // Un valor vacío o no numérico no puede dejar el timeout en 0 (abortaría
  // todas las llamadas) ni en NaN: se usa el valor por defecto y se avisa.
  private leerTimeoutMs(): number {
    const valor = this.config.get<string>('PREDICTIVE_MODEL_TIMEOUT_MS');
    if (valor === undefined || valor.trim() === '') {
      return TIMEOUT_POR_DEFECTO_MS;
    }
    const ms = Number(valor);
    if (!Number.isInteger(ms) || ms <= 0) {
      this.logger.warn(
        `PREDICTIVE_MODEL_TIMEOUT_MS="${valor}" no es un entero positivo: se usan ${TIMEOUT_POR_DEFECTO_MS} ms.`,
      );
      return TIMEOUT_POR_DEFECTO_MS;
    }
    return ms;
  }

  private cabeceras(): Record<string, string> {
    const cabeceras: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
    const apiKey = this.config.get<string>('PREDICTIVE_MODEL_API_KEY');
    if (apiKey) {
      cabeceras.Authorization = `Bearer ${apiKey}`;
    }
    return cabeceras;
  }
}
