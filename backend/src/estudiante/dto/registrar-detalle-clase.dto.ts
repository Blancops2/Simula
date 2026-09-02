import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class RegistrarDetalleClaseDto {
  @ApiPropertyOptional({ description: 'Período (trimestre) en el que se cursó: 1, 2 o 3.', example: 2 })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3], { message: 'El período debe ser 1, 2 o 3.' })
  periodo?: number;

  @ApiPropertyOptional({ description: 'Año en el que se cursó.', example: 2026 })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  anno?: number;

  @ApiPropertyOptional({ description: 'Nota en escala 0 - 100.', example: 85 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  nota?: number;
}