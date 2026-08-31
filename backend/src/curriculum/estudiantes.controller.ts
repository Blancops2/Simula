import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurriculumService } from './curriculum.service';
import { AsignarPlantillaDto } from './dto/asignar-plantilla.dto';

@ApiTags('plantillas-malla')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller('estudiantes')
export class EstudiantesController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Patch(':userId/plantilla')
  @ApiOperation({ summary: 'Asigna (o reasigna) a un estudiante la plantilla/versión de malla que está cursando.' })
  asignarPlantilla(@Param('userId') userId: string, @Body() dto: AsignarPlantillaDto) {
    return this.curriculum.asignarEstudiante(userId, dto);
  }
}
