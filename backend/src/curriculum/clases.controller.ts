import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurriculumService } from './curriculum.service';
import { CreateClaseDto } from './dto/create-clase.dto';
import { CreateRequisitoDto } from './dto/create-requisito.dto';
import { UpdateClaseDto } from './dto/update-clase.dto';

@ApiTags('plantillas-malla')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller()
export class ClasesController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Post('plantillas/:plantillaId/clases')
  @ApiOperation({ summary: 'Agrega una clase a una plantilla.' })
  agregarClase(@Param('plantillaId') plantillaId: string, @Body() dto: CreateClaseDto) {
    return this.curriculum.agregarClase(plantillaId, dto);
  }

  @Patch('clases/:id')
  @ApiOperation({ summary: 'Actualiza los datos de una clase.' })
  actualizarClase(@Param('id') id: string, @Body() dto: UpdateClaseDto) {
    return this.curriculum.actualizarClase(id, dto);
  }

  @Delete('clases/:id')
  @ApiOperation({ summary: 'Elimina una clase y sus relaciones de prerrequisito/correquisito.' })
  eliminarClase(@Param('id') id: string) {
    return this.curriculum.eliminarClase(id);
  }

  @Post('clases/:id/requisitos')
  @ApiOperation({
    summary: 'Agrega un prerrequisito o correquisito a una clase, validando que no genere ciclos.',
  })
  agregarRequisito(@Param('id') id: string, @Body() dto: CreateRequisitoDto) {
    return this.curriculum.agregarRequisito(id, dto);
  }

  @Delete('requisitos/:id')
  @ApiOperation({ summary: 'Elimina una relación de prerrequisito/correquisito.' })
  eliminarRequisito(@Param('id') id: string) {
    return this.curriculum.eliminarRequisito(id);
  }
}
