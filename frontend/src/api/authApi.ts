import type { AuthResponse } from './httpClient';
import { httpClient } from './httpClient';

export type { AuthResponse } from './httpClient';

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const { data } = await httpClient.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function logoutRequest(): Promise<void> {
  await httpClient.post('/auth/logout');
}
