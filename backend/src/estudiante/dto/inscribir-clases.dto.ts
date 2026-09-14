import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class InscribirClasesDto {
  @ApiProperty({
    description:
      'Id del período académico (catálogo "periodo") previamente seleccionado y confirmado por el estudiante ' +
      '(HU-03-04: toda inscripción/simulación debe quedar asociada al período que el estudiante eligió, no a uno ' +
      'calculado a partir de la fecha del servidor). Se revalida en el servidor que exista y esté habilitado.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Debes indicar un período académico (periodoId) antes de matricular.' })
  periodoId: string;

  @ApiProperty({
    description: 'Ids (idPlantillaMalla_has_Clase) de las clases de la plantilla asignada al estudiante a inscribir.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes seleccionar al menos una clase.' })
  @IsString({ each: true })
  claseIds: string[];
}
