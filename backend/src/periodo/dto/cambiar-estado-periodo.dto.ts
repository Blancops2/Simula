import { ApiProperty } from '@nestjs/swagger';
import { EstadoPeriodo } from '../../common/enums';
import { IsEnum } from 'class-validator';

export class CambiarEstadoPeriodoDto {
  @ApiProperty({ enum: EstadoPeriodo })
  @IsEnum(EstadoPeriodo)
  estado: EstadoPeriodo;
}
