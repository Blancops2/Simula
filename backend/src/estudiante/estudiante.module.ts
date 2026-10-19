import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { DocumentosModule } from '../documentos/documentos.module';
import { PeriodoModule } from '../periodo/periodo.module';
import { PlanEstudioModule } from '../plan-estudio/plan-estudio.module';
import { EstudianteController } from './estudiante.controller';
import { EstudianteService } from './estudiante.service';
import { GuardarHistorialPdfService } from './guardar-historial-pdf.service';
import { HistorialAdminController } from './historial-admin.controller';
import { ModeloPredictivoService } from './modelo-predictivo.service';
import { MotorPredictivo } from './motor-predictivo';

@Module({
  imports: [CurriculumModule, DocumentosModule, PeriodoModule, PlanEstudioModule],
  controllers: [EstudianteController, HistorialAdminController],
  // Único lugar que conoce la implementación concreta del motor predictivo.
  providers: [
    EstudianteService,
    GuardarHistorialPdfService,
    { provide: MotorPredictivo, useClass: ModeloPredictivoService },
  ],
})
export class EstudianteModule {}
