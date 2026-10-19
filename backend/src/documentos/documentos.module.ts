import { Module } from '@nestjs/common';
import { ExtraccionPdfController } from './extraccion-pdf.controller';
import { ExtraccionPdfService } from './extraccion-pdf.service';
import { InterpretacionService } from './interpretacion.service';
import { LecturaPdfService } from './lectura-pdf.service';
import { LimpiezaTextoService } from './limpieza-texto.service';
import { ReglasHistorialService } from './reglas-historial.service';

@Module({
  controllers: [ExtraccionPdfController],
  providers: [ExtraccionPdfService, LecturaPdfService, LimpiezaTextoService, InterpretacionService, ReglasHistorialService],
  // El módulo de estudiante la usa para volver a extraer el PDF al guardar.
  exports: [ExtraccionPdfService],
})
export class DocumentosModule {}
