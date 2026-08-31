import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCarreraDto {
  @ApiProperty({ example: 'Ingeniería en Sistemas' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la carrera es obligatorio.' })
  nombre: string;

  @ApiProperty({ example: 'ISIS' })
  @IsString()
  @IsNotEmpty({ message: 'El código de la carrera es obligatorio.' })
  codigo: string;

  @ApiProperty({ description: 'Id de la facultad a la que pertenece la carrera.', example: 'FAC-ING' })
  @IsString()
  @IsNotEmpty({ message: 'La facultad es obligatoria.' })
  idFacultad: string;
}
