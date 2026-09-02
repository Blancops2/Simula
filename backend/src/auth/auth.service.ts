import {
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { ROLE_ID_MAP, Role } from '../common/enums';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface';

export interface AuthUserView {
  id: string;
  email: string;
  role: Role;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUserView;
}

const GENERIC_AUTH_ERROR = 'Correo o contraseña incorrectos.';
const NO_ROLE_ERROR =
  'Tu cuenta no tiene un rol asignado. Contacta al administrador del sistema.';

@Injectable()
export class AuthService {
  private readonly institutionalDomains: string[];
  private readonly maxAttempts: number;
  private readonly lockoutMinutes: number;
  private readonly accessSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.institutionalDomains = [
      this.config.get<string>('INSTITUTIONAL_EMAIL_DOMAIN') ?? '@simula.edu.co',
      this.config.get<string>('INSTITUTIONAL_EMAIL_DOMAIN_ESTUDIANT'),
    ]
      .filter((domain): domain is string => !!domain)
      .map((domain) => domain.toLowerCase());
    this.maxAttempts = Number(this.config.get('MAX_LOGIN_ATTEMPTS') ?? 5);
    this.lockoutMinutes = Number(this.config.get('LOGIN_LOCKOUT_MINUTES') ?? 15);
    this.accessSecret = this.config.get<string>('JWT_ACCESS_SECRET') ?? '';
    this.accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    this.refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET') ?? '';
    this.refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
  }

  async login(dto: LoginDto, userAgent?: string): Promise<SessionTokens> {
    const email = dto.email.toLowerCase().trim();

    if (!this.institutionalDomains.some((domain) => email.endsWith(domain))) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    // correoInstitucional no tiene restricción UNIQUE en la BD real, así que
    // no calificaría como filtro de findUnique (Prisma lo exige para eso).
    const user = await this.prisma.user.findFirst({ where: { correoInstitucional: email } });
    if (!user) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.max(
        1,
        Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000),
      );
      throw new HttpException(
        `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta nuevamente en ${minutesLeft} minuto(s).`,
        423, // HTTP 423 Locked (no está en el enum HttpStatus de esta versión de @nestjs/common)
      );
    }

    const passwordMatches =
      !!user.passwordHash && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!passwordMatches) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { idUser: user.idUser },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    return this.issueSession(user, userAgent);
  }

  async refresh(rawRefreshToken: string): Promise<SessionTokens> {
    const payload = this.verifyRefreshToken(rawRefreshToken);

    const session = await this.prisma.session.findUnique({
      where: { idSession: payload.sessionId },
    });

    if (!session || session.revokedAt || !session.expiresAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    if (session.refresTokenHash !== this.hashToken(rawRefreshToken)) {
      await this.prisma.session.update({
        where: { idSession: session.idSession },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    const user = await this.prisma.user.findUnique({ where: { idUser: session.idUser } });
    if (!user) {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    await this.prisma.session.update({
      where: { idSession: session.idSession },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(user, session.userAgent ?? undefined);
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }
    try {
      const payload = this.verifyRefreshToken(rawRefreshToken);
      await this.prisma.session.updateMany({
        where: { idSession: payload.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Token ya inválido o expirado: no hay sesión que invalidar.
    }
  }

  private verifyRefreshToken(rawRefreshToken: string): RefreshTokenPayload {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.refreshSecret,
      });
      if (payload.type !== 'refresh') {
        throw new Error('invalid-type');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }
  }

  private async registerFailedAttempt(user: User): Promise<void> {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const shouldLock = attempts >= this.maxAttempts;

    await this.prisma.user.update({
      where: { idUser: user.idUser },
      data: shouldLock
        ? {
            failedLoginAttempts: 0,
            lockedUntil: new Date(Date.now() + this.lockoutMinutes * 60000),
          }
        : { failedLoginAttempts: attempts },
    });
  }

  private async issueSession(user: User, userAgent?: string): Promise<SessionTokens> {
    const sessionId = randomUUID();
    const refreshExpiresAt = new Date(Date.now() + this.parseTtlMs(this.refreshExpiresIn));

    const refreshPayload: RefreshTokenPayload = {
      sub: user.idUser,
      sessionId,
      type: 'refresh',
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });

    await this.prisma.session.create({
      data: {
        idSession: sessionId,
        idUser: user.idUser,
        refresTokenHash: this.hashToken(refreshToken),
        userAgent,
        expiresAt: refreshExpiresAt,
      },
    });

    const role = ROLE_ID_MAP[user.idRole];
    if (!role) {
      // Credenciales correctas pero sin rol utilizable: es un problema de
      // autorización (falta configurar el rol), no de autenticación, así que
      // se distingue del error genérico de credenciales inválidas.
      throw new ForbiddenException(NO_ROLE_ERROR);
    }

    const accessPayload: AccessTokenPayload = {
      sub: user.idUser,
      role,
      type: 'access',
    };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn,
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.idUser, email: user.correoInstitucional ?? '', role },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlMs(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }
    const amount = Number(match[1]);
    const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]] ?? 86400000;
    return amount * unitMs;
  }
}
