import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePlanEstudioDto {
  @ApiPropertyOptional({ description: 'Nueva etiqueta del año recomendado.', example: 'segundo año' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  anno?: string;

  @ApiPropertyOptional({ description: 'Nueva etiqueta del periodo recomendado.', example: 'segundo periodo' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  periodo?: string;

  @ApiPropertyOptional({
    description:
      'Reemplaza por completo la lista de clases recomendadas en este periodo (ids de PlantillaMalla_has_Clase, todas deben pertenecer a la misma malla que este plan de estudio).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  clasesIds?: string[];
}
