import { logWarn } from "@/lib/logger";

// Fail-fast de configuración (INFRA-072). Sin estas variables la app arranca "bien"
// pero falla en silencio: pg cae a localhost sin DATABASE_URL y better-auth genera
// URLs/cookies con un origen equivocado sin BETTER_AUTH_URL.
// HUB_DB_URL NO está aquí a propósito: es opcional (hubEnabled() → fallback a
// sales_records); solo se avisa.
export const REQUIRED_RUNTIME_ENV = ["DATABASE_URL", "BETTER_AUTH_URL"] as const;

type Env = Record<string, string | undefined>;

// Pura: decide a partir del entorno recibido. Solo exige en runtime de producción;
// en dev/test y durante `next build` (NEXT_PHASE, sin envs) no hace nada.
// Los mensajes nombran la variable, nunca su valor.
export function assertRuntimeEnv(env: Env): { warnings: string[] } {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") {
    return { warnings: [] };
  }
  const missing = REQUIRED_RUNTIME_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias en producción: ${missing.join(", ")}.`);
  }
  const warnings: string[] = [];
  if (!env.HUB_DB_URL?.trim()) {
    warnings.push(
      "HUB_DB_URL no está definido: la lectura del zoho-hub queda deshabilitada y se usa sales_records (fallback)."
    );
  }
  const hubCompany = hubCompanyConfig(env);
  if (hubCompany.invalid) {
    warnings.push(`${HUB_COMPANY_ID_ENV} no es un UUID válido: se ignora y los datos del hub no se restringen a ninguna empresa.`);
  } else if (env.HUB_DB_URL?.trim() && hubCompany.id === null) {
    warnings.push(
      `${HUB_COMPANY_ID_ENV} no está definido: cualquier empresa de la app puede leer los datos del hub (SEC-035). Defínelo con el id de la empresa dueña del hub.`
    );
  }
  for (const name of DB_URL_ENV) {
    const url = env[name]?.trim();
    if (url && needsTls(url)) {
      warnings.push(
        `${name} apunta a un host fuera de la red interna sin TLS obligatorio: añade sslmode=require (o verify-full) a la URL.`
      );
    }
  }
  return { warnings };
}

// SEC-035: el zoho-hub es la réplica de UNA empresa y sus consultas no filtran por
// empresa. HUB_COMPANY_ID (opcional) es el id de la empresa de la app dueña de esos
// datos; con él, src/lib/hub-company.ts impide que otra empresa lea el hub. Sin él (o
// si no es un UUID, que se trata como ausente) no se restringe nada, como antes.
export const HUB_COMPANY_ID_ENV = "HUB_COMPANY_ID";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HubCompanyConfig = { id: string | null; invalid: boolean };

export function hubCompanyConfig(env: Env = process.env): HubCompanyConfig {
  const raw = env[HUB_COMPANY_ID_ENV]?.trim();
  if (!raw) return { id: null, invalid: false };
  if (!UUID_RE.test(raw)) return { id: null, invalid: true };
  return { id: raw.toLowerCase(), invalid: false };
}

// PRIV-095: las BD viven en la red Docker interna del VPS, donde la conexión sin TLS
// no sale del host. Si una URL apunta fuera (otro servidor, BD gestionada) y no exige
// TLS, las credenciales y los datos viajarían en claro: se avisa al arrancar. Solo
// aviso, nunca error, para que un falso positivo no tumbe producción.
const DB_URL_ENV = ["DATABASE_URL", "HUB_DB_URL"] as const;

// Modos de pg que obligan a cifrar (prefer/allow/disable no lo garantizan).
const TLS_SSLMODES = new Set(["require", "verify-ca", "verify-full", "no-verify"]);

function needsTls(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false; // no analizable: ya fallará al conectar; aquí no se adivina
  }
  if (isInternalHost(url.hostname)) return false;
  const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
  const ssl = url.searchParams.get("ssl")?.toLowerCase();
  return !(sslmode && TLS_SSLMODES.has(sslmode)) && ssl !== "true" && ssl !== "1";
}

// Interno: localhost, nombre de servicio Docker (sin punto), *.internal/*.local o IP
// privada/loopback (10/8, 172.16/12, 192.168/16, 127/8).
function isInternalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || !h.includes(".") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  const ip = h.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Aplica la comprobación y emite los avisos una sola vez por proceso (el módulo
// puede evaluarse en más de un bundle: proxy y servidor).
const globalForEnv = globalThis as unknown as { __runtimeEnvWarned?: boolean };

export function enforceRuntimeEnv(
  env: Env = process.env,
  warn: (message: string) => void = logWarn
): void {
  const { warnings } = assertRuntimeEnv(env);
  if (globalForEnv.__runtimeEnvWarned) return;
  warnings.forEach((w) => warn(w));
  globalForEnv.__runtimeEnvWarned = true;
}

// Límites por usuario (SEC-006, src/lib/rate-limit.ts), en peticiones por minuto.
// Opcionales: sin variables valen estos defaults y producción no necesita configurar
// nada. Están muy por encima del uso normal: la página más pesada (/analytics con
// todas sus pestañas) lanza unas 25 lecturas a /api/data al cargar y un cambio de
// filtro unas 15, así que 600/min cubre ~20 cargas completas por minuto.
export const RATE_LIMIT_DEFAULTS = { read: 600, mutation: 120, export: 30 } as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_DEFAULTS;
export type RateLimitConfig = Record<RateLimitBucket, number>;

const RATE_LIMIT_ENV: Record<RateLimitBucket, string> = {
  read: "RATE_LIMIT_READS_PER_MINUTE",
  mutation: "RATE_LIMIT_MUTATIONS_PER_MINUTE",
  export: "RATE_LIMIT_EXPORTS_PER_MINUTE",
};

// Un valor inválido (vacío, 0, negativo, decimal, texto) cae al default: un error de
// configuración nunca deja la app sin límite ni la bloquea.
function positiveInt(raw: string | undefined, fallback: number): number {
  const v = raw?.trim();
  if (!v || !/^\d+$/.test(v)) return fallback;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function rateLimitConfig(env: Env = process.env): RateLimitConfig {
  return {
    read: positiveInt(env[RATE_LIMIT_ENV.read], RATE_LIMIT_DEFAULTS.read),
    mutation: positiveInt(env[RATE_LIMIT_ENV.mutation], RATE_LIMIT_DEFAULTS.mutation),
    export: positiveInt(env[RATE_LIMIT_ENV.export], RATE_LIMIT_DEFAULTS.export),
  };
}
