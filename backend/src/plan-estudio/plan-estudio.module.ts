import { Module } from '@nestjs/common';
import { PlanEstudioController } from './plan-estudio.controller';
import { PlanEstudioService } from './plan-estudio.service';

@Module({
  controllers: [PlanEstudioController],
  providers: [PlanEstudioService],
  exports: [PlanEstudioService],
})
export class PlanEstudioModule {}
