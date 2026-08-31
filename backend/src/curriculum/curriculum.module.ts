import { Module } from '@nestjs/common';
import { CarrerasController } from './carreras.controller';
import { ClasesController } from './clases.controller';
import { CurriculumService } from './curriculum.service';
import { EstudiantesController } from './estudiantes.controller';
import { PlantillasController } from './plantillas.controller';

@Module({
  controllers: [CarrerasController, PlantillasController, ClasesController, EstudiantesController],
  providers: [CurriculumService],
  exports: [CurriculumService],
})
export class CurriculumModule {}
