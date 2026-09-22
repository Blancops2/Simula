import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
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

  @Get('periodos')
  @ApiOperation({ summary: 'Lista los períodos académicos habilitados que el estudiante puede seleccionar.' })
  periodosDisponibles() {
    return this.estudiante.obtenerPeriodosDisponibles();
  }

  @Get('plan-estudio')
  @ApiOperation({
    summary:
      'Plan de estudio recomendado (solo lectura) de la malla asignada: periodos con sus clases, cada una marcada como aprobada/en curso/disponible/bloqueada según el historial del estudiante.',
  })
  planEstudio(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerPlanEstudio(user.userId, user);
  }

  @Get('recomendaciones/clases')
  @ApiOperation({
    summary:
      'Clases recomendadas por el modelo predictivo (HU-04-01) para el período actual. `disponible: false` cuando el modelo no está configurado o no respondió.',
  })
  recomendacionClases(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerRecomendacionClases(user.userId, user);
  }

  @Get('recomendaciones/periodo')
  @ApiOperation({
    summary:
      'Periodo del plan de estudio (HU-04-01) que mejor se acopla al avance real del estudiante (mayor % de clases aprobadas sin llegar al 100%).',
  })
  recomendacionPeriodo(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerRecomendacionPeriodo(user.userId, user);
  }

  @Get('historial')
  @ApiOperation({ summary: 'Historial de clases cursadas por el estudiante autenticado.' })
  historial(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerHistorial(user.userId);
  }

  @Post('historial/importar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary:
      'Importa en lote el historial académico del estudiante autenticado desde un archivo CSV ' +
      '(columnas: codigo,periodo,nota). El estado (aprobada/reprobada) se calcula a partir de la nota, no se ' +
      'recibe del CSV. Es un autorreporte: nunca sobrescribe registros ya cargados por el administrador.',
  })
  importarHistorial(@CurrentUser() user: RequestUser, @UploadedFile() archivo?: Express.Multer.File) {
    return this.estudiante.importarHistorialCsv(user.userId, archivo);
  }

  @Get('pensum')
  @ApiOperation({
    summary:
      'Árbol completo (solo lectura) de la plantilla de malla asignada, con cada clase marcada como aprobada o en curso ' +
      '(oficialmente por el historial, o autorreportada por el propio estudiante). El historial en sí ya no se edita ' +
      'desde el pensum (ver POST /estudiante/historial/importar); solo se puede autorreportar "en curso".',
  })
  pensum(@CurrentUser() user: RequestUser) {
    return this.estudiante.obtenerPensum(user.userId, user);
  }

  @Post('pensum/clases/:claseId')
  @ApiOperation({
    summary:
      'Autorreporta una clase de la malla como "en curso" en el período vigente (no altera el historial oficial). ' +
      'Rechaza clases ya aprobadas o con prerrequisitos pendientes. Sin body: no se pide nota ni período, una ' +
      'clase en curso no tiene nota final todavía.',
  })
  marcarClaseEnCurso(@CurrentUser() user: RequestUser, @Param('claseId') claseId: string) {
    return this.estudiante.marcarClaseEnCurso(user.userId, claseId, user);
  }

  @Delete('pensum/clases/:claseId')
  @ApiOperation({ summary: 'Quita el autorreporte de "en curso" de una clase en el período vigente.' })
  desmarcarClaseEnCurso(@CurrentUser() user: RequestUser, @Param('claseId') claseId: string) {
    return this.estudiante.desmarcarClaseEnCurso(user.userId, claseId);
  }

  @Post('inscripciones')
  @ApiOperation({
    summary:
      'Inscribe un lote de clases en el período académico indicado (debe estar habilitado), validando en el servidor prerrequisitos y correquisitos.',
  })
  inscribir(@CurrentUser() user: RequestUser, @Body() dto: InscribirClasesDto) {
    return this.estudiante.inscribir(user.userId, dto.claseIds, dto.periodoId, user);
  }

  @Get('inscripciones')
  @ApiOperation({ summary: 'Lista todas las inscripciones vigentes del estudiante, en cualquier período.' })
  listarInscripciones(@CurrentUser() user: RequestUser) {
    return this.estudiante.listarInscripciones(user.userId);
  }

  @Delete('inscripciones/:id')
  @ApiOperation({ summary: 'Cancela una inscripción propia antes de que inicie el período.' })
  cancelarInscripcion(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.estudiante.cancelarInscripcion(user.userId, id);
  }
}
