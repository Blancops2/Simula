import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class InscribirClasesDto {
  @ApiProperty({
    description:
      'Ids (idPlantillaMalla_has_Clase) de las clases de la plantilla asignada al estudiante a inscribir en el período actual.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes seleccionar al menos una clase.' })
  @IsString({ each: true })
  claseIds: string[];
}
