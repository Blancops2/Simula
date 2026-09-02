import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ActualizarPerfilEstudianteDto } from './dto/actualizar-perfil-estudiante.dto';
import { InscribirClasesDto } from './dto/inscribir-clases.dto';
import { EstudianteService } from './estudiante.service';

@ApiTags('estudiante')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ESTUDIANTE)
@Controller('estudiante')
export class EstudianteController {
  constructor(private readonly estudiante: EstudianteService) {}

  @Get('perfil')
  @ApiOperation({ summary: 'Perfil del estudiante autenticado: datos básicos y avance académico.' })
  perfil(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerPerfil(user.userId, user);
  }

  @Patch('perfil')
  @ApiOperation({
    summary: 'Actualiza los datos de identidad editables del estudiante autenticado (nombre completo, código estudiantil).',
  })
  actualizarPerfil(@CurrentUser() user: RequestUser, @Body() dto: ActualizarPerfilEstudianteDto) {
    return this.estudiante.actualizarPerfil(user.userId, dto);
  }

  @Get('malla')
  @ApiOperation({
    summary:
      'Árbol de la plantilla de malla asignada al estudiante, cruzado con su historial: aprobada, en curso, disponible o bloqueada.',
  })
  malla(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerMalla(user.userId, user);
  }

  @Get('historial')
  @ApiOperation({ summary: 'Historial de clases cursadas por el estudiante autenticado.' })
  historial(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerHistorial(user.userId);
  }

  @Get('pensum')
  @ApiOperation({
    summary:
      'Árbol completo (solo lectura) de la plantilla de malla asignada, con cada clase marcada como cursada (oficialmente por el historial, o autorreportada por el propio estudiante).',
  })
  pensum(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerPensum(user.userId, user);
  }

  @Post('pensum/clases/:claseId')
  @ApiOperation({
    summary: 'Marca una clase de la malla como ya cursada (autorreporte propio, no altera el historial oficial).',
  })
  marcarClaseCursada(@CurrentUser() user: RequestUser, @Param('claseId') claseId: string) {
    return this.estudiante.marcarClaseCursada(user.userId, claseId);
  }

  @Delete('pensum/clases/:claseId')
  @ApiOperation({ summary: 'Desmarca una clase previamente autorreportada como cursada.' })
  desmarcarClaseCursada(@CurrentUser() user: RequestUser, @Param('claseId') claseId: string) {
    return this.estudiante.desmarcarClaseCursada(user.userId, claseId);
  }

  @Post('inscripciones')
  @ApiOperation({
    summary:
      'Inscribe un lote de clases disponibles para el período actual, validando en el servidor prerrequisitos y correquisitos.',
  })
  inscribir(@CurrentUser() user: RequestUser, @Body() dto: InscribirClasesDto) {
    return this.estudiante.inscribir(user.userId, dto.claseIds, user);
  }

  @Get('inscripciones')
  @ApiOperation({ summary: 'Lista las inscripciones del estudiante para el período académico actual.' })
  listarInscripciones(@CurrentUser() user: RequestUser) {
    return this.estudiante.listarInscripciones(user.userId);
  }

  @Delete('inscripciones/:id')
  @ApiOperation({ summary: 'Cancela una inscripción propia antes de que inicie el período.' })
  cancelarInscripcion(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.estudiante.cancelarInscripcion(user.userId, id);
  }
}
