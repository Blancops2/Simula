import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../common/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurriculumService } from './curriculum.service';
import { CreateCarreraDto } from './dto/create-carrera.dto';

@ApiTags('carreras')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller('carreras')
export class CarrerasController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Post()
  @ApiOperation({ summary: 'Crea una carrera (necesaria para asociarle plantillas de malla).' })
  crear(@Body() dto: CreateCarreraDto) {
    return this.curriculum.crearCarrera(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todas las carreras.' })
  listar() {
    return this.curriculum.listarCarreras();
  }
}
