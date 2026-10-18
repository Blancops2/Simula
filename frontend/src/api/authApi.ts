import type { AuthResponse } from './httpClient';
import { httpClient } from './httpClient';

export type { AuthResponse } from './httpClient';

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const { data } = await httpClient.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export interface RegistroPayload {
  email: string;
  nombreCompleto: string;
  codigoEstudiantil: string;
  password: string;
}

export async function registroRequest(payload: RegistroPayload): Promise<AuthResponse> {
  const { data } = await httpClient.post<AuthResponse>('/auth/registro', payload);
  return data;
}

export async function logoutRequest(): Promise<void> {
  await httpClient.post('/auth/logout');
}
