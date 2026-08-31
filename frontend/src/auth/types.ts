export type Role = 'ESTUDIANTE' | 'ADMINISTRADOR';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
