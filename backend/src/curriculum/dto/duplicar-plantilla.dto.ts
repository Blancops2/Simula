import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DuplicarPlantillaDto {
  @ApiPropertyOptional({
    description: 'Nombre para la nueva versión. Si se omite, se reutiliza el nombre de la plantilla original.',
    example: 'Malla 2027',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío.' })
  nombre?: string;
}
