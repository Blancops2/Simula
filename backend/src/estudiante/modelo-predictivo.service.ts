import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CamposControlSolicitud,
  ClaseRecomendadaModelo,
  DatosEvaluacionCarga,
  DatosRecomendaciones,
  EvaluacionClaseModelo,
  RespuestaEvaluacionCarga,
  RespuestaRecomendaciones,
  VERSION_CONTRATO_MODELO,
} from './modelo-predictivo.contrato';

// NO_CONFIGURADO: no hay PREDICTIVE_MODEL_URL (el llamador decide si hay
// fallback). CARRERA_NO_SOPORTADA: el modelo respondió 422, la UI puede dar
// un mensaje específico. NO_DISPONIBLE: cualquier otra falla (HTTP, red,
// timeout o respuesta con forma inesperada).
export type FallaPrediccion = 'NO_CONFIGURADO' | 'CARRERA_NO_SOPORTADA' | 'NO_DISPONIBLE';

export type ResultadoModelo<T> = { ok: true; respuesta: T } | { ok: false; falla: FallaPrediccion };

// D4 (docs/modelo-predictivo/03-decisiones-contrato.md): dos endpoints sobre una
// sola URL base; las rutas son parte del contrato, por eso no van en .env.
const RUTA_RECOMENDACIONES = 'recomendaciones';
const RUTA_EVALUACION_CARGA = 'evaluacion-carga';

// HU-04-01: el modelo predictivo en sí está fuera de nuestro alcance, pero el
// sitio debe quedar listo para consumirlo. Este adaptador solo habla HTTP con
// el modelo y valida sus respuestas; el fallback local (cuando no hay URL
// configurada) lo decide EstudianteService a partir de `NO_CONFIGURADO`. Si
// la URL SÍ está configurada y falla, se reporta como falla (no se disfraza
// de fallback) para que la UI pueda distinguir "no disponible" de
// "recomendación real".
@Injectable()
export class ModeloPredictivoService {
  private readonly logger = new Logger(ModeloPredictivoService.name);

  constructor(private readonly config: ConfigService) {}

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

  // `control` viene de la simulación persistida (tabla Simulacion), para que
  // el idSolicitud enviado al modelo sea el mismo que quedó guardado.
  async evaluarCarga(
    datos: DatosEvaluacionCarga,
    control: CamposControlSolicitud,
  ): Promise<ResultadoModelo<RespuestaEvaluacionCarga>> {
    const codigosCarga = datos.cargaAcademica.clases.map((c) => c.codigoClase);
    return this.llamar(
      RUTA_EVALUACION_CARGA,
      datos,
      (cuerpo, idSolicitud) => this.validarEvaluacionCarga(cuerpo, idSolicitud, codigosCarga),
      control,
    );
  }

  static nuevoControl(): CamposControlSolicitud {
    return {
      versionContrato: VERSION_CONTRATO_MODELO,
      idSolicitud: randomUUID(),
      fechaSolicitud: new Date().toISOString(),
    };
  }

  // ---------- Llamada HTTP común a ambos endpoints ----------

  // Sin reintentos: la llamada ocurre mientras el estudiante espera en la
  // pantalla, y un reintento duplicaría el tiempo de espera ante un timeout.
  private async llamar<T>(
    ruta: string,
    datos: object,
    validar: (cuerpo: unknown, idSolicitud: string) => T | null,
    control: CamposControlSolicitud = ModeloPredictivoService.nuevoControl(),
  ): Promise<ResultadoModelo<T>> {
    const url = this.construirUrl(ruta);
    if (!url) {
      return { ok: false, falla: 'NO_CONFIGURADO' };
    }

    const { idSolicitud } = control;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.cabeceras(),
        body: JSON.stringify({ ...control, ...datos }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, falla: await this.registrarError(ruta, idSolicitud, response) };
      }

      const respuesta = validar(await response.json(), idSolicitud);
      if (!respuesta) {
        this.logger.warn(`Modelo predictivo (/${ruta}) respondió un cuerpo con forma inesperada (idSolicitud ${idSolicitud}).`);
        return { ok: false, falla: 'NO_DISPONIBLE' };
      }
      return { ok: true, respuesta };
    } catch (error) {
      this.logger.warn(
        `No se pudo consultar el modelo predictivo (/${ruta}, idSolicitud ${idSolicitud}): ${(error as Error).message}`,
      );
      return { ok: false, falla: 'NO_DISPONIBLE' };
    } finally {
      clearTimeout(timeout);
    }
  }

  // 400/401/403 indican un defecto de nuestro lado (petición o configuración),
  // por eso van como error y no como warning (§4.2 de la propuesta).
  private async registrarError(ruta: string, idSolicitud: string, response: Response): Promise<FallaPrediccion> {
    const codigoError = await response
      .json()
      .then((cuerpo: { error?: { codigo?: unknown } }) =>
        typeof cuerpo?.error?.codigo === 'string' ? cuerpo.error.codigo : null,
      )
      .catch(() => null);
    const detalle = `Modelo predictivo (/${ruta}) respondió ${response.status}${codigoError ? ` ${codigoError}` : ''} (idSolicitud ${idSolicitud})`;

    if ([400, 401, 403].includes(response.status)) {
      this.logger.error(`${detalle}.`);
      return 'NO_DISPONIBLE';
    }
    if (response.status === 422) {
      this.logger.warn(`${detalle}: carrera o malla no soportada por el modelo.`);
      return 'CARRERA_NO_SOPORTADA';
    }
    if (response.status === 429) {
      this.logger.warn(`${detalle}: límite excedido (Retry-After: ${response.headers.get('Retry-After') ?? 'n/d'}).`);
      return 'NO_DISPONIBLE';
    }
    this.logger.warn(`${detalle}.`);
    return 'NO_DISPONIBLE';
  }

  // ---------- Validación manual de respuestas (campos desconocidos se ignoran) ----------

  // Además de la forma, exige que la carga recomendada sea armable: solo
  // clases candidatas, sin repetidas y dentro del tope de U.V.
  private validarRecomendaciones(
    cuerpo: unknown,
    idSolicitud: string,
    datos: DatosRecomendaciones,
  ): RespuestaRecomendaciones | null {
    if (!this.esObjeto(cuerpo) || !this.controlValido(cuerpo, idSolicitud)) {
      return null;
    }
    const { probabilidadAprobarTodo, clases, observaciones } = cuerpo;
    if (!Array.isArray(clases)) {
      return null;
    }
    if (!(observaciones === undefined || this.esListaDeTextos(observaciones))) {
      return null;
    }
    // Una carga vacía no tiene probabilidad conjunta; con clases es obligatoria.
    const sinClases = clases.length === 0;
    const probabilidadValida = sinClases
      ? probabilidadAprobarTodo === undefined || probabilidadAprobarTodo === null
      : this.esProbabilidad(probabilidadAprobarTodo);
    if (!probabilidadValida) {
      return null;
    }

    const uvPorCodigo = new Map(datos.clasesCandidatas.map((c) => [c.codigoClase, c.unidadesValorativas]));
    const vistas = new Set<string>();
    let totalUv = 0;
    const validas: ClaseRecomendadaModelo[] = [];
    for (const c of clases) {
      if (
        !this.esObjeto(c) ||
        typeof c.codigoClase !== 'string' ||
        !uvPorCodigo.has(c.codigoClase) ||
        vistas.has(c.codigoClase) ||
        !this.esProbabilidad(c.probabilidadAprobacion) ||
        !this.esListaDeTextos(c.factores) ||
        !(c.motivo === undefined || c.motivo === null || typeof c.motivo === 'string')
      ) {
        return null;
      }
      vistas.add(c.codigoClase);
      totalUv += uvPorCodigo.get(c.codigoClase)!;
      validas.push({
        codigoClase: c.codigoClase,
        probabilidadAprobacion: c.probabilidadAprobacion,
        factores: c.factores,
        motivo: c.motivo ?? null,
      });
    }
    if (totalUv > datos.limiteUnidadesValorativas) {
      return null;
    }

    return {
      versionContrato: cuerpo.versionContrato as string,
      idSolicitud,
      versionModelo: cuerpo.versionModelo as string,
      probabilidadAprobarTodo: sinClases ? null : (probabilidadAprobarTodo as number),
      clases: validas,
      observaciones: observaciones ?? [],
    };
  }

  // Además de la forma, exige exactamente una evaluación por cada clase de la
  // carga enviada: una clase faltante o un código ajeno dejaría a la UI
  // mostrando probabilidades que no corresponden a lo que el estudiante armó.
  private validarEvaluacionCarga(
    cuerpo: unknown,
    idSolicitud: string,
    codigosCarga: string[],
  ): RespuestaEvaluacionCarga | null {
    if (!this.esObjeto(cuerpo) || !this.controlValido(cuerpo, idSolicitud)) {
      return null;
    }
    const { probabilidadAprobarTodo, clases, observaciones } = cuerpo;
    if (!this.esProbabilidad(probabilidadAprobarTodo) || !Array.isArray(clases)) {
      return null;
    }
    if (!(observaciones === undefined || this.esListaDeTextos(observaciones))) {
      return null;
    }

    const pendientes = new Set(codigosCarga);
    const evaluadas: EvaluacionClaseModelo[] = [];
    for (const c of clases) {
      if (
        !this.esObjeto(c) ||
        typeof c.codigoClase !== 'string' ||
        !pendientes.has(c.codigoClase) ||
        !this.esProbabilidad(c.probabilidadAprobacion) ||
        !this.esListaDeTextos(c.factores)
      ) {
        return null;
      }
      pendientes.delete(c.codigoClase);
      evaluadas.push({
        codigoClase: c.codigoClase,
        probabilidadAprobacion: c.probabilidadAprobacion,
        factores: c.factores,
      });
    }
    if (pendientes.size > 0) {
      return null;
    }

    return {
      versionContrato: cuerpo.versionContrato as string,
      idSolicitud,
      versionModelo: cuerpo.versionModelo as string,
      probabilidadAprobarTodo,
      clases: evaluadas,
      observaciones: observaciones ?? [],
    };
  }

  private controlValido(cuerpo: Record<string, unknown>, idSolicitud: string): boolean {
    return (
      cuerpo.idSolicitud === idSolicitud &&
      typeof cuerpo.versionContrato === 'string' &&
      typeof cuerpo.versionModelo === 'string'
    );
  }

  private esObjeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
  }

  private esListaDeTextos(valor: unknown): valor is string[] {
    return Array.isArray(valor) && valor.every((v) => typeof v === 'string');
  }

  private esProbabilidad(valor: unknown): valor is number {
    return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 1;
  }

  // ---------- Configuración (.env) ----------

  // PREDICTIVE_MODEL_URL es la URL BASE (D8); se tolera que termine en "/".
  private construirUrl(ruta: string): string | null {
    const base = this.config.get<string>('PREDICTIVE_MODEL_URL');
    return base ? `${base.replace(/\/+$/, '')}/${ruta}` : null;
  }

  private timeoutMs(): number {
    return Number(this.config.get<string>('PREDICTIVE_MODEL_TIMEOUT_MS') ?? 3000);
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
