import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePlantillaDto {
  @ApiProperty({ description: 'Id de la carrera a la que pertenece la plantilla.', example: 'CAR-ISC' })
  @IsString()
  @IsNotEmpty({ message: 'La carrera es obligatoria.' })
  carreraId: string;

  @ApiProperty({ example: 'Malla 2026' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la plantilla es obligatorio.' })
  nombre: string;
}
