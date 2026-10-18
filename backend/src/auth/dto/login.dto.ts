import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'estudiante@simula.edu.co' })
  // Se recorta antes de validar: un espacio copiado junto al correo no debe
  // rechazarse como "formato inválido".
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail({}, { message: 'El correo debe tener un formato válido.' })
  email: string;

  @ApiProperty()
  @IsString({ message: 'La contraseña es obligatoria.' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password: string;
}
