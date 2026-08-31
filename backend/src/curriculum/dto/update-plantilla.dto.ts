import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePlantillaDto {
  @ApiPropertyOptional({ example: 'Malla 2026 - revisión B' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacío.' })
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Activa/desactiva la plantilla sin eliminarla ni afectar a los estudiantes que ya la usan.',
  })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
