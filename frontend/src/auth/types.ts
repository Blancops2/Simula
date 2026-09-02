export type Role = 'ESTUDIANTE' | 'ADMINISTRADOR';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export const ROLE_HOME: Record<Role, string> = {
  ESTUDIANTE: '/estudiante',
  ADMINISTRADOR: '/admin',
};
