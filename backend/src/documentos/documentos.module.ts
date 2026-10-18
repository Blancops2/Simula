import { Module } from '@nestjs/common';
import { ExtraccionPdfController } from './extraccion-pdf.controller';
import { ExtraccionPdfService } from './extraccion-pdf.service';
import { InterpretacionService } from './interpretacion.service';
import { LecturaPdfService } from './lectura-pdf.service';
import { LimpiezaTextoService } from './limpieza-texto.service';

@Module({
  controllers: [ExtraccionPdfController],
  providers: [ExtraccionPdfService, LecturaPdfService, LimpiezaTextoService, InterpretacionService],
})
export class DocumentosModule {}
