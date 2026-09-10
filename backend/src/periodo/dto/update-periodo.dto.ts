import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdatePeriodoDto {
  @ApiPropertyOptional({ description: 'Año del período académico.', example: 2026 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  anno?: number;

  @ApiPropertyOptional({ description: 'Período (trimestre) dentro del año: 1, 2 o 3.', example: 1 })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3], { message: 'El período debe ser 1, 2 o 3.' })
  periodo?: number;

  @ApiPropertyOptional({ description: 'Fecha de inicio del período (ISO 8601).', example: '2026-01-12' })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiPropertyOptional({ description: 'Fecha de fin del período (ISO 8601).', example: '2026-06-05' })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
