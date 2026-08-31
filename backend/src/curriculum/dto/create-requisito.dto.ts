import { ApiProperty } from '@nestjs/swagger';
import { TipoRequisito } from '../../common/enums';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreateRequisitoDto {
  @ApiProperty({
    description:
      'Id de la clase (dentro de la misma plantilla) que se exige como requisito — el idPlantillaMalla_has_Clase, no el id del catálogo de la clase.',
  })
  @IsString()
  @IsNotEmpty({ message: 'El requisito es obligatorio.' })
  requisitoId: string;

  @ApiProperty({ enum: TipoRequisito })
  @IsEnum(TipoRequisito)
  tipo: TipoRequisito;
}
