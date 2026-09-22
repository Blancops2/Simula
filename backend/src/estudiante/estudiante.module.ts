import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { PeriodoModule } from '../periodo/periodo.module';
import { PlanEstudioModule } from '../plan-estudio/plan-estudio.module';
import { EstudianteController } from './estudiante.controller';
import { EstudianteService } from './estudiante.service';
import { HistorialAdminController } from './historial-admin.controller';
import { ModeloPredictivoService } from './modelo-predictivo.service';

@Module({
  imports: [CurriculumModule, PeriodoModule, PlanEstudioModule],
  controllers: [EstudianteController, HistorialAdminController],
  providers: [EstudianteService, ModeloPredictivoService],
})
export class EstudianteModule {}
