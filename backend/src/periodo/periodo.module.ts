import { Module } from '@nestjs/common';
import { PeriodoController } from './periodo.controller';
import { PeriodoService } from './periodo.service';

@Module({
  controllers: [PeriodoController],
  providers: [PeriodoService],
  exports: [PeriodoService],
})
export class PeriodoModule {}
