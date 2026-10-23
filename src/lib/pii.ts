// Filtro de datos personales compartido por el logger y la auditoría (PRIV-017).
// Una sola fuente para la lista de claves sensibles: si se amplía, se amplía en ambos.

// Claves que pueden llevar datos personales o de clientes: se descartan a cualquier
// profundidad aunque un llamador las pase por error.
export const PII_KEY = /e-?mail|name|nombre|customer|cliente|phone|tel[eé]fono|address|direcci[oó]n|password|token|secret/i;

export interface DropPiiOptions {
  /** Si se indica, los textos se acotan a esta longitud. */
  maxText?: number;
}

export function dropPiiKeys(value: unknown, options: DropPiiOptions = {}): unknown {
  const { maxText } = options;
  if (typeof value === "string") return maxText === undefined ? value : value.slice(0, maxText);
  if (Array.isArray(value)) return value.map((v) => dropPiiKeys(v, options));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!PII_KEY.test(k)) out[k] = dropPiiKeys(v, options);
    }
    return out;
  }
  return value;
}

// Los errores de BD o de auth pueden repetir lo que escribió el usuario (p. ej. un
// email duplicado): se sustituyen las direcciones antes de registrarlos.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function redactEmails(text: string): string {
  return text.replace(EMAIL, "[email]");
}
