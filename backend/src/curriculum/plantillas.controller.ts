import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurriculumService } from './curriculum.service';
import { CreatePlantillaDto } from './dto/create-plantilla.dto';
import { DuplicarPlantillaDto } from './dto/duplicar-plantilla.dto';
import { UpdatePlantillaDto } from './dto/update-plantilla.dto';

@ApiTags('plantillas-malla')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plantillas')
export class PlantillasController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Post()
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crea una nueva plantilla de malla (versión 1) para una carrera.' })
  crear(@Body() dto: CreatePlantillaDto) {
    return this.curriculum.crearPlantilla(dto);
  }

  @Get()
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Lista las plantillas existentes, opcionalmente filtradas por carrera.' })
  listar(@Query('carreraId') carreraId?: string) {
    return this.curriculum.listarPlantillas(carreraId);
  }

  @Get(':id')
  @Roles(Role.ADMINISTRADOR, Role.ESTUDIANTE)
  @ApiOperation({
    summary:
      'Devuelve el árbol completo de una plantilla (clases agrupadas por nivel, con sus prerrequisitos/correquisitos). Solo lectura para estudiantes, y solo de su propia plantilla asignada.',
  })
  obtenerArbol(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.curriculum.obtenerArbol(id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Actualiza el nombre y/o el estado activo/inactivo de una plantilla.' })
  actualizar(@Param('id') id: string, @Body() dto: UpdatePlantillaDto) {
    return this.curriculum.actualizarPlantilla(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({
    summary: 'Elimina una plantilla. Se rechaza si hay estudiantes cursándola; en ese caso, desactívala.',
  })
  eliminar(@Param('id') id: string) {
    return this.curriculum.eliminarPlantilla(id);
  }

  @Post(':id/duplicar')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({
    summary:
      'Duplica una plantilla (clases y requisitos incluidos) como una nueva versión, sin afectar la original ni a los estudiantes que ya la cursan.',
  })
  duplicar(@Param('id') id: string, @Body() dto: DuplicarPlantillaDto) {
    return this.curriculum.duplicarPlantilla(id, dto);
  }

  @Get(':id/estudiantes')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Lista los estudiantes asignados a esta plantilla/versión.' })
  listarEstudiantes(@Param('id') id: string) {
    return this.curriculum.listarEstudiantes(id);
  }
}
