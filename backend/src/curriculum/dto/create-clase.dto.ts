import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoClase } from '../../common/enums';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateClaseDto {
  @ApiProperty({ example: 'MAT101' })
  @IsString()
  @IsNotEmpty({ message: 'El código de la clase es obligatorio.' })
  codigo: string;

  @ApiProperty({ example: 'Cálculo I' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre de la clase es obligatorio.' })
  nombre: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1, { message: 'Las unidades valorativas deben ser al menos 1.' })
  unidadesValorativas: number;

  @ApiProperty({ description: 'Nivel/semestre sugerido.', example: 1 })
  @IsInt()
  @Min(1, { message: 'El nivel debe ser al menos 1.' })
  nivel: number;

  @ApiPropertyOptional({ enum: TipoClase, default: TipoClase.OBLIGATORIA })
  @IsOptional()
  @IsEnum(TipoClase)
  tipo?: TipoClase;

  @ApiPropertyOptional({ description: 'Posición X del nodo en el canvas del editor visual.' })
  @IsOptional()
  @IsNumber()
  posX?: number;

  @ApiPropertyOptional({ description: 'Posición Y del nodo en el canvas del editor visual.' })
  @IsOptional()
  @IsNumber()
  posY?: number;
}
