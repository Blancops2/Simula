import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AsignarPlantillaDto {
  @ApiProperty({ description: 'Id de la plantilla/versión de malla a asignar al estudiante.' })
  @IsString()
  @IsNotEmpty({ message: 'La plantilla es obligatoria.' })
  plantillaId: string;
}
