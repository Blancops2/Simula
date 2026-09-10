import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoPeriodo } from '../../common/enums';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreatePeriodoDto {
  @ApiProperty({ description: 'Año del período académico.', example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  anno: number;

  @ApiProperty({ description: 'Período (trimestre) dentro del año: 1, 2 o 3.', example: 1 })
  @IsInt()
  @IsIn([1, 2, 3], { message: 'El período debe ser 1, 2 o 3.' })
  periodo: number;

  @ApiPropertyOptional({
    enum: EstadoPeriodo,
    description: 'Estado inicial del período. Si se omite, se crea como habilitado.',
  })
  @IsOptional()
  @IsEnum(EstadoPeriodo)
  estado?: EstadoPeriodo;

  @ApiPropertyOptional({ description: 'Fecha de inicio del período (ISO 8601).', example: '2026-01-12' })
  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @ApiPropertyOptional({ description: 'Fecha de fin del período (ISO 8601).', example: '2026-06-05' })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;
}
