import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'estudiante@simula.edu.co' })
  @IsEmail({}, { message: 'El correo debe tener un formato válido.' })
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password: string;
}
