/**
 * Longitud mínima de contraseña. La usan a la vez better-auth (servidor, auth.ts) y
 * el formulario de registro, para que el cliente no deje pasar algo que luego se
 * rechaza. Módulo puro: se importa desde componentes de cliente.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const AUTH_ERROR_FALLBACK = "No se pudo completar la operación. Inténtalo de nuevo.";

/** Forma del `error` que devuelve el cliente de better-auth (signIn/signUp). */
export interface AuthClientError {
  code?: string | null;
  status?: number;
  message?: string | null;
}

// Solo los códigos que puede ver un usuario en login/registro. USER_ALREADY_EXISTS
// no se traduce a propósito (SEC-039): el registro no debe delatar cuentas existentes.
const MESSAGES: Record<string, string> = {
  PASSWORD_TOO_SHORT: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga.",
  INVALID_EMAIL: "El correo electrónico no es válido.",
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
};

/**
 * Mensaje en español para un error de better-auth. Nunca devuelve el `message`
 * original (en inglés): lo desconocido cae en un genérico.
 */
export function authErrorMessage(error: AuthClientError | null | undefined): string {
  if (!error) return AUTH_ERROR_FALLBACK;
  // El limitador de better-auth responde 429 sin `code`.
  if (error.status === 429) return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
  return (error.code && MESSAGES[error.code]) || AUTH_ERROR_FALLBACK;
}
