import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePlanEstudioDto {
  @ApiProperty({ description: 'Id de la PlantillaMalla a la que pertenece este periodo recomendado.' })
  @IsString()
  @IsNotEmpty()
  idPlantillaMalla: string;

  @ApiProperty({ description: 'Etiqueta del año recomendado.', example: 'primer año' })
  @IsString()
  @IsNotEmpty()
  anno: string;

  @ApiProperty({ description: 'Etiqueta del periodo recomendado, dentro de ese año.', example: 'primer periodo' })
  @IsString()
  @IsNotEmpty()
  periodo: string;
}
