import {
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './constants';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Inicia sesión con correo institucional y contraseña.' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada correctamente.' })
  @ApiResponse({ status: 401, description: 'Credenciales o dominio inválidos.' })
  @ApiResponse({ status: 423, description: 'Cuenta bloqueada temporalmente.' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(
      dto,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renueva el access token usando la cookie de sesión.' })
  @ApiResponse({ status: 200, description: 'Sesión renovada.' })
  @ApiResponse({ status: 401, description: 'No hay sesión activa o expiró.' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw) {
      throw new UnauthorizedException('No hay sesión activa.');
    }
    const { accessToken, refreshToken, user } = await this.authService.refresh(raw);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cierra la sesión actual (cliente y servidor).' })
  @ApiResponse({ status: 204, description: 'Sesión cerrada.' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(raw);
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('COOKIE_SECURE') === 'true',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
