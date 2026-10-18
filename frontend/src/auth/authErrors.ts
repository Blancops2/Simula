export const GENERIC_AUTH_ERROR = 'Correo o contraseña incorrectos.';

// Traduce el error de /auth/login o /auth/registro al mensaje del formulario.
// Los 400, 403, 409 y 423 traen un mensaje del backend pensado para el usuario.
export function authErrorMessage(err: unknown): string {
  const axiosError = err as {
    response?: { status?: number; data?: { message?: string | string[] } };
  };
  const response = axiosError.response;

  // Sin respuesta: el backend está caído o no hay red. No es un problema de
  // credenciales, así que no se debe mostrar el mensaje genérico.
  if (!response) {
    return 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.';
  }

  const raw = response.data?.message;
  const message = Array.isArray(raw) ? raw.join(' ') : raw;

  switch (response.status) {
    case 400:
      // Errores de validación del DTO o correo fuera del dominio institucional.
      return message ?? 'Revisa los datos ingresados.';
    case 401:
      return GENERIC_AUTH_ERROR;
    case 403:
      return message ?? 'Tu cuenta no tiene un rol asignado. Contacta al administrador.';
    case 409:
      return message ?? 'Ya existe una cuenta con esos datos.';
    case 423:
      return message ?? 'Cuenta bloqueada temporalmente. Intenta más tarde.';
    default:
      if (response.status && response.status >= 500) {
        return 'Ocurrió un error en el servidor. Intenta nuevamente en unos minutos.';
      }
      return GENERIC_AUTH_ERROR;
  }
}
