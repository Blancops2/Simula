import {
  BadRequestException,
  ConflictException,
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
import { RegistroDto } from './dto/registro.dto';
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
const STUDENT_ROLE_ID = 'ROL-EST';
const BCRYPT_ROUNDS = 12;
const NO_ROLE_ERROR =
  'Tu cuenta no tiene un rol asignado. Contacta al administrador del sistema.';

@Injectable()
export class AuthService {
  private readonly institutionalDomains: string[];
  private readonly studentDomain: string | null;
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
    this.studentDomain =
      this.config.get<string>('INSTITUTIONAL_EMAIL_DOMAIN_ESTUDIANT')?.toLowerCase() || null;
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
      // El dominio no revela si la cuenta existe, así que se puede indicar
      // explícitamente cuáles son los correos aceptados.
      throw new BadRequestException(
        `El correo debe ser institucional (${this.institutionalDomains.join(' o ')}).`,
      );
    }

    // correoInstitucional no tiene restricción UNIQUE en la BD real, así que
    // no calificaría como filtro de findUnique (Prisma lo exige para eso).
    const user = await this.prisma.user.findFirst({ where: { correoInstitucional: email } });
    if (!user) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw this.lockedException(user.lockedUntil);
    }

    const passwordMatches =
      !!user.passwordHash && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!passwordMatches) {
      const lockedUntil = await this.registerFailedAttempt(user);
      // El intento que alcanza el máximo ya bloquea la cuenta: se informa en
      // esta misma respuesta en vez de esperar al siguiente intento.
      if (lockedUntil) {
        throw this.lockedException(lockedUntil);
      }
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

  // Auto-registro del estudiante en su primer ingreso. Solo el dominio de
  // estudiantes puede registrarse: las cuentas de administrador no se crean
  // desde aquí.
  async registrar(dto: RegistroDto, userAgent?: string): Promise<SessionTokens> {
    const email = dto.email.toLowerCase();

    if (!this.studentDomain || !email.endsWith(this.studentDomain)) {
      throw new BadRequestException(
        this.studentDomain
          ? `Solo los estudiantes pueden registrarse, con un correo ${this.studentDomain}.`
          : 'El registro de estudiantes no está habilitado.',
      );
    }

    // Ni el correo ni el código tienen UNIQUE en la BD real (ver login() y
    // EstudianteService.actualizarPerfil), así que se valida aquí.
    const [correoEnUso, codigoEnUso] = await Promise.all([
      this.prisma.user.findFirst({ where: { correoInstitucional: email } }),
      this.prisma.user.findFirst({ where: { codigoInstitucional: dto.codigoEstudiantil } }),
    ]);
    if (correoEnUso) {
      throw new ConflictException('Ya existe una cuenta con ese correo. Inicia sesión.');
    }
    if (codigoEnUso) {
      throw new ConflictException('Ese código estudiantil ya está en uso.');
    }

    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        idUser: randomUUID(),
        idRole: STUDENT_ROLE_ID,
        correoInstitucional: email,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        failedLoginAttempts: 0,
        NombreCompleto: dto.nombreCompleto,
        codigoInstitucional: dto.codigoEstudiantil,
        createdAt: now,
        updatedAt: now,
      },
    });

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

  /** Registra el intento fallido; devuelve la fecha de desbloqueo si este intento bloqueó la cuenta. */
  private async registerFailedAttempt(user: User): Promise<Date | null> {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockedUntil =
      attempts >= this.maxAttempts ? new Date(Date.now() + this.lockoutMinutes * 60000) : null;

    await this.prisma.user.update({
      where: { idUser: user.idUser },
      data: lockedUntil
        ? { failedLoginAttempts: 0, lockedUntil }
        : { failedLoginAttempts: attempts },
    });

    return lockedUntil;
  }

  private lockedException(lockedUntil: Date): HttpException {
    const minutesLeft = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));
    return new HttpException(
      `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta nuevamente en ${minutesLeft} minuto(s).`,
      423, // HTTP 423 Locked (no está en el enum HttpStatus de esta versión de @nestjs/common)
    );
  }

  private async issueSession(user: User, userAgent?: string): Promise<SessionTokens> {
    // Se valida antes de crear la Session para no dejar filas huérfanas en la BD.
    const role = ROLE_ID_MAP[user.idRole];
    if (!role) {
      // Credenciales correctas pero sin rol utilizable: es un problema de
      // autorización (falta configurar el rol), no de autenticación, así que
      // se distingue del error genérico de credenciales inválidas.
      throw new ForbiddenException(NO_ROLE_ERROR);
    }

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
