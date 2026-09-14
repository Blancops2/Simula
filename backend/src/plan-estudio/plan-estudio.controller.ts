import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enums';
import { CreatePlanEstudioDto } from './dto/create-plan-estudio.dto';
import { UpdatePlanEstudioDto } from './dto/update-plan-estudio.dto';
import { PlanEstudioService } from './plan-estudio.service';

@ApiTags('plan-estudio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller('plan-estudio')
export class PlanEstudioController {
  constructor(private readonly planEstudio: PlanEstudioService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un periodo recomendado (ej. "primer periodo") dentro de una malla.' })
  crear(@Body() dto: CreatePlanEstudioDto) {
    return this.planEstudio.crear(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista los periodos recomendados de una malla, con las clases asignadas a cada uno.' })
  listar(@Query('plantillaId') plantillaId: string) {
    return this.planEstudio.listarPorPlantilla(plantillaId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita la etiqueta de un periodo y/o reemplaza la lista completa de clases recomendadas en él.',
  })
  actualizar(@Param('id') id: string, @Body() dto: UpdatePlanEstudioDto) {
    return this.planEstudio.actualizar(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Elimina un periodo recomendado (y sus clases asignadas).' })
  eliminar(@Param('id') id: string) {
    return this.planEstudio.eliminar(id);
  }
}
