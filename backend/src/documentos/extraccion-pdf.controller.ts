import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  Controller,
  ExceptionFilter,
  HttpCode,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enums';
import { ExtraccionPdfService } from './extraccion-pdf.service';

export const TAMANO_MAXIMO_PDF = 10 * 1024 * 1024;
const FIRMA_PDF = '%PDF-';

// Multer lanza el 413 con su propio mensaje en inglés ("File too large");
// se reescribe para que el cliente reciba el mismo idioma que el resto de la API.
@Catch(PayloadTooLargeException)
export class ArchivoDemasiadoGrandeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(413)
      .json({ statusCode: 413, message: 'El archivo supera el tamaño máximo de 10 MB.', error: 'Payload Too Large' });
  }
}

@ApiTags('estudiante')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ESTUDIANTE)
@Controller('estudiante/historial')
export class ExtraccionPdfController {
  constructor(private readonly extraccion: ExtraccionPdfService) {}

  @Post('extraer-pdf')
  @HttpCode(200)
  @UseFilters(ArchivoDemasiadoGrandeFilter)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: TAMANO_MAXIMO_PDF, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'PDF digital (máx. 10 MB).' } },
    },
  })
  @ApiOperation({
    summary:
      'Extrae el texto del historial académico en PDF digital y detecta campos "Clave: valor", tablas y tipos de ' +
      'dato. Solo lectura: el archivo se procesa en memoria y no se guarda nada (ni el PDF ni el historial).',
  })
  @ApiOkResponse({ description: 'ExtractionResult: campos, tablas, líneas limpias/descartadas y texto crudo.' })
  @ApiBadRequestResponse({ description: 'No se adjuntó archivo, no es un PDF, o el PDF está dañado/protegido con contraseña.' })
  @ApiPayloadTooLargeResponse({ description: 'El archivo supera 10 MB.' })
  @ApiUnprocessableEntityResponse({ description: 'El PDF no tiene capa de texto (escaneado); no se soporta OCR.' })
  extraer(@UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('Debes adjuntar el PDF de tu historial académico en el campo "file".');
    }
    // Se valida por contenido, no por extensión ni MIME.
    if (file.buffer.subarray(0, FIRMA_PDF.length).toString('latin1') !== FIRMA_PDF) {
      throw new BadRequestException('El archivo no es un PDF válido.');
    }
    // Busboy decodifica el nombre como latin1; se recupera el UTF-8 original
    // para que los nombres con tildes no lleguen corruptos.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.extraccion.extraer(fileName, file.buffer);
  }
}
