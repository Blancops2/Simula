import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoHistorial } from '../../common/enums';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class RegistrarHistorialDto {
  @ApiProperty({
    description:
      'Id de la clase dentro de la malla (idPlantillaMalla_has_Clase) que se cursó.',
  })
  @IsString()
  @IsNotEmpty({ message: 'La clase es obligatoria.' })
  claseId: string;

  @ApiProperty({ enum: EstadoHistorial })
  @IsEnum(EstadoHistorial)
  estado: EstadoHistorial;

  @ApiPropertyOptional({ description: 'Nota en escala 0 - 100.', example: 85 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  nota?: number;

  @ApiProperty({ description: 'Período académico en formato AAAA-1 o AAAA-2.', example: '2026-1' })
  @Matches(/^\d{4}-[12]$/, { message: 'El período debe tener el formato AAAA-1 o AAAA-2.' })
  periodo: string;
}
