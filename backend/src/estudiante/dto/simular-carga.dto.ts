import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SimularCargaDto {
  @ApiProperty({
    description:
      'Id del período académico (catálogo "periodo") cuya carga inscrita se va a simular. Se revalida en el servidor ' +
      'que exista y esté habilitado (HU-03-04). La carga simulada son las clases inscritas por el estudiante en ese ' +
      'período; debe haber al menos una.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Debes indicar un período académico (periodoId) para simular la carga.' })
  periodoId: string;
}
