import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ActualizarPerfilEstudianteDto } from './dto/actualizar-perfil-estudiante.dto';
import { RegistrarHistorialDto } from './dto/registrar-historial.dto';
import { EstudianteService } from './estudiante.service';

@ApiTags('estudiante')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller('estudiantes/:userId')
export class HistorialAdminController {
  constructor(private readonly estudiante: EstudianteService) {}

  @Patch('perfil')
  @ApiOperation({ summary: 'Registra/actualiza el nombre y código estudiantil de un estudiante.' })
  actualizarPerfil(@Param('userId') userId: string, @Body() dto: ActualizarPerfilEstudianteDto) {
    return this.estudiante.actualizarPerfil(userId, dto);
  }

  @Get('historial')
  @ApiOperation({ summary: 'Consulta el historial académico de un estudiante.' })
  historial(@Param('userId') userId: string) {
    return this.estudiante.obtenerHistorial(userId);
  }

  @Post('historial')
  @ApiOperation({
    summary:
      'Registra o corrige (upsert por clase+período) el resultado de un estudiante en una clase: aprobada, reprobada o en curso.',
  })
  registrarHistorial(@Param('userId') userId: string, @Body() dto: RegistrarHistorialDto) {
    return this.estudiante.registrarHistorial(userId, dto);
  }

  @Delete('historial/:historialId')
  @ApiOperation({ summary: 'Elimina un registro de historial académico (corrección de errores de captura).' })
  eliminarHistorial(@Param('userId') userId: string, @Param('historialId') historialId: string) {
    return this.estudiante.eliminarHistorial(userId, historialId);
  }
}
