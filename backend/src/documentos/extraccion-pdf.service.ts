import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { ExtractionResult } from './extraccion.types';
import { InterpretacionService } from './interpretacion.service';
import { LecturaPdfService } from './lectura-pdf.service';
import { LimpiezaTextoService } from './limpieza-texto.service';

// Orquesta extraer → limpiar → interpretar. Todo en memoria: el archivo no
// se guarda en disco ni en base de datos.
@Injectable()
export class ExtraccionPdfService {
  constructor(
    private readonly lectura: LecturaPdfService,
    private readonly limpieza: LimpiezaTextoService,
    private readonly interpretacion: InterpretacionService,
  ) {}

  async extraer(fileName: string, buffer: Buffer): Promise<ExtractionResult> {
    const inicio = performance.now();

    const documento = await this.lectura.leer(buffer);
    const rawLines = documento.pages.reduce((total, p) => total + p.lines.length, 0);
    if (rawLines === 0) {
      throw new UnprocessableEntityException(
        'El PDF no tiene texto seleccionable (probablemente es un documento escaneado). ' +
          'Solo se admiten PDF digitales; los PDF escaneados no están soportados.',
      );
    }

    const { pages: cleanPages, removed } = this.limpieza.limpiar(documento.pages);
    const { fields, tables } = this.interpretacion.interpretar(cleanPages);

    const cleanLines = cleanPages.reduce((total, p) => total + p.lines.length, 0);
    const cleanText = cleanPages.map((p) => p.lines.map((l) => l.text).join('\n')).join('\n\n');

    return {
      fileName,
      fileSize: buffer.length,
      pageCount: documento.pageCount,
      metadata: documento.metadata,
      stats: {
        rawLines,
        cleanLines,
        removedLines: removed.length,
        fields: fields.length,
        tables: tables.length,
        elapsedMs: Math.round(performance.now() - inicio),
      },
      fields,
      tables,
      removed,
      cleanPages,
      rawPages: documento.pages,
      cleanText,
    };
  }
}
