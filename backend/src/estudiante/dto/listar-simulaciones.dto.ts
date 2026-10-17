import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const LIMITE_SIMULACIONES_POR_DEFECTO = 5;
export const LIMITE_SIMULACIONES_MAXIMO = 20;

export class ListarSimulacionesDto {
  @ApiPropertyOptional({
    description: `Cuántas simulaciones devolver, de la más reciente a la más antigua (${LIMITE_SIMULACIONES_POR_DEFECTO} por defecto, máximo ${LIMITE_SIMULACIONES_MAXIMO}).`,
    minimum: 1,
    maximum: LIMITE_SIMULACIONES_MAXIMO,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_SIMULACIONES_MAXIMO)
  limite?: number;
}
