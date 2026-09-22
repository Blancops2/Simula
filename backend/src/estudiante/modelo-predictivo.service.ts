import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PrediccionInput {
  codigoEstudiantil: string | null;
  codigosAprobados: string[];
  nivelSugerido: number;
}

export type FuenteRecomendacion = 'MODELO_EXTERNO' | 'FALLBACK_LOCAL';

export interface PrediccionResultado {
  codigos: string[];
  fuente: FuenteRecomendacion;
}

// HU-04-01: el modelo predictivo en sí está fuera de nuestro alcance, pero el
// sitio debe quedar listo para consumirlo. Mientras no exista una URL
// configurada, se usa un fallback local (a cargo del llamador, vía
// `calcularFallback`) para que la sección de recomendaciones siga siendo
// útil hoy. Si la URL SÍ está configurada y falla, se devuelve `null` (no se
// disfraza de fallback) para que la UI pueda distinguir "no disponible" de
// "recomendación real".
@Injectable()
export class ModeloPredictivoService {
  private readonly logger = new Logger(ModeloPredictivoService.name);

  constructor(private readonly config: ConfigService) {}

  async obtenerCodigosRecomendados(
    input: PrediccionInput,
    calcularFallback: () => string[],
  ): Promise<PrediccionResultado | null> {
    const url = this.config.get<string>('PREDICTIVE_MODEL_URL');
    if (!url) {
      return { codigos: calcularFallback(), fuente: 'FALLBACK_LOCAL' };
    }

    const timeoutMs = Number(this.config.get<string>('PREDICTIVE_MODEL_TIMEOUT_MS') ?? 3000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`Modelo predictivo respondió ${response.status}.`);
        return null;
      }
      const body = (await response.json()) as { codigos?: unknown };
      if (!Array.isArray(body.codigos) || !body.codigos.every((c) => typeof c === 'string')) {
        this.logger.warn('Modelo predictivo respondió un cuerpo con forma inesperada.');
        return null;
      }
      return { codigos: body.codigos, fuente: 'MODELO_EXTERNO' };
    } catch (error) {
      this.logger.warn(`No se pudo consultar el modelo predictivo: ${(error as Error).message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
