import { Role } from '../../common/enums';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  type: 'refresh';
}
