import axios, { type AxiosRequestConfig } from 'axios';
import type { AuthUser } from '../auth/types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export const httpClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

httpClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Deduplicada a propósito: si dos llamadores piden refrescar la sesión casi al
// mismo tiempo (p. ej. React.StrictMode montando efectos dos veces, o varios
// requests en paralelo recibiendo 401), deben compartir la MISMA petición.
// El refresh token rota en cada uso en el Back-End, así que dos POST /auth/refresh
// concurrentes con el mismo token harían que el segundo llegue con un token ya
// revocado por el primero y falle.
let inFlightRefresh: Promise<AuthResponse | null> | null = null;

export async function refreshSession(): Promise<AuthResponse | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = httpClient
      .post<AuthResponse>('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRoute = originalRequest?.url?.includes('/auth/');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthRoute) {
      originalRequest._retry = true;
      const refreshed = await refreshSession();
      if (refreshed) {
        originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${refreshed.accessToken}` };
        return httpClient(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);
