import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ActualizarPerfilEstudianteDto {
  @ApiPropertyOptional({ example: 'Ana María Pérez' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío.' })
  nombreCompleto?: string;

  @ApiPropertyOptional({ example: '20231234' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El código estudiantil no puede estar vacío.' })
  codigoEstudiantil?: string;
}
