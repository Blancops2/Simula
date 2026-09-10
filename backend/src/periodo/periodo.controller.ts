import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enums';
import { CambiarEstadoPeriodoDto } from './dto/cambiar-estado-periodo.dto';
import { CreatePeriodoDto } from './dto/create-periodo.dto';
import { UpdatePeriodoDto } from './dto/update-periodo.dto';
import { PeriodoService } from './periodo.service';

@ApiTags('periodos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR)
@Controller('periodos')
export class PeriodoController {
  constructor(private readonly periodo: PeriodoService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un período académico (año, período y estado).' })
  crear(@Body() dto: CreatePeriodoDto) {
    return this.periodo.crear(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos los períodos académicos, habilitados y deshabilitados.' })
  listar() {
    return this.periodo.listar();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita año, período o fechas de un período académico existente.' })
  actualizar(@Param('id') id: string, @Body() dto: UpdatePeriodoDto) {
    return this.periodo.actualizar(id, dto);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Cambia el estado (habilitado/deshabilitado) de un período académico.' })
  cambiarEstado(
    @Param('id') id: string,
    @Body() dto: CambiarEstadoPeriodoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.periodo.cambiarEstado(id, dto, user);
  }
}
