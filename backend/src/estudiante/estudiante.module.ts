import { Module } from '@nestjs/common';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { EstudianteController } from './estudiante.controller';
import { EstudianteService } from './estudiante.service';
import { HistorialAdminController } from './historial-admin.controller';

@Module({
  imports: [CurriculumModule],
  controllers: [EstudianteController, HistorialAdminController],
  providers: [EstudianteService],
})
export class EstudianteModule {}
