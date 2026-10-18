import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { DocumentosModule } from './documentos/documentos.module';
import { EstudianteModule } from './estudiante/estudiante.module';
import { PeriodoModule } from './periodo/periodo.module';
import { PlanEstudioModule } from './plan-estudio/plan-estudio.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CurriculumModule,
    DocumentosModule,
    EstudianteModule,
    PeriodoModule,
    PlanEstudioModule,
  ],
})
export class AppModule {}
