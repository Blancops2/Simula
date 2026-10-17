import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SimularCargaDto {
  @ApiPropertyOptional({
    description:
      'Id del período académico (catálogo "periodo") cuya carga inscrita se va a simular. Es opcional en el DTO ' +
      'para que su ausencia se informe junto con el resto de validaciones previas (PERIODO_NO_SELECCIONADO) y ' +
      'no como un error aparte. Se revalida en el servidor que exista y esté habilitado (HU-03-04). La carga ' +
      'simulada son las clases inscritas por el estudiante en ese período; debe haber al menos una.',
  })
  @IsOptional()
  @IsString()
  periodoId?: string;
}
