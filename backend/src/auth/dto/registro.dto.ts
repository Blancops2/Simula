import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Mismos datos editables del apartado de perfil (nombre y código estudiantil)
// más las credenciales. La carrera no se pide aquí: se valida después, cuando
// el estudiante sube su historial académico.
export class RegistroDto {
  @ApiProperty({ example: 'juan.perez@unah.hn' })
  @Transform(trim)
  @IsEmail({}, { message: 'El correo debe tener un formato válido.' })
  @MaxLength(45, { message: 'El correo no puede tener más de 45 caracteres.' })
  email: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @Transform(trim)
  @IsString({ message: 'El nombre es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(100, { message: 'El nombre no puede tener más de 100 caracteres.' })
  nombreCompleto: string;

  @ApiProperty({ example: '20211000123' })
  @Transform(trim)
  @IsString({ message: 'El código estudiantil es obligatorio.' })
  @IsNotEmpty({ message: 'El código estudiantil es obligatorio.' })
  @MaxLength(45, { message: 'El código estudiantil no puede tener más de 45 caracteres.' })
  codigoEstudiantil: string;

  @ApiProperty({ minLength: 8 })
  @IsString({ message: 'La contraseña es obligatoria.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  // bcrypt ignora todo lo que pase de 72 bytes.
  @MaxLength(72, { message: 'La contraseña no puede tener más de 72 caracteres.' })
  password: string;
}
