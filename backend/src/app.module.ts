import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CurriculumModule } from './curriculum/curriculum.module';
import { EstudianteModule } from './estudiante/estudiante.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CurriculumModule,
    EstudianteModule,
  ],
})
export class AppModule {}
