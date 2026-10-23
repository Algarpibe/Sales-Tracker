import { AppError, RATE_LIMITED_CODE, RATE_LIMITED_MESSAGE } from "@/lib/errors";
import { rateLimitConfig, type RateLimitBucket } from "@/lib/env";

/**
 * Límite de peticiones por USUARIO (SEC-006). El limitador de better-auth solo cubre
 * /api/auth/*; esto cubre las lecturas de GET /api/data (data-api.ts), las mutaciones
 * (guard requireApproved con `fresh: true`, guards.ts) y la exportación a Excel.
 *
 * La clave es el id del usuario de la sesión, nunca la IP: X-Forwarded-For solo es
 * fiable si el proxy de delante lo reescribe, y eso aún no está garantizado.
 *
 * Ventana fija: empieza con la primera petición del usuario y se reinicia sola al
 * cumplirse, haya tráfico o no (el contador de better-auth, en cambio, solo se
 * reinicia tras `window` s SIN peticiones). Las peticiones rechazadas no cuentan ni
 * alargan la ventana.
 *
 * LIMITACIÓN: el estado vive en memoria del proceso. Vale porque la app corre como un
 * único contenedor con un solo proceso de Node; con varias réplicas cada una llevaría
 * su propio contador (el límite efectivo se multiplicaría) y habría que moverlo a un
 * almacén compartido. Un reinicio pone todos los contadores a cero.
 */

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export interface RateLimiterOptions {
  /** Peticiones permitidas por ventana. */
  limit: number;
  windowMs: number;
  /** Tope de claves en memoria. Al llenarse se barren las caducadas y, si no basta, la más antigua. */
  maxKeys?: number;
  /** Reloj inyectable (tests). */
  now?: () => number;
}

export interface RateLimiter {
  consume(key: string): RateLimitResult;
  /** Claves en memoria (tests). */
  size(): number;
}

const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  if (!(limit > 0) || !(windowMs > 0) || !(maxKeys > 0)) {
    throw new Error("createRateLimiter: limit, windowMs y maxKeys deben ser positivos.");
  }
  // Orden de inserción = orden de inicio de ventana (al abrir una ventana nueva la
  // clave se reinserta al final): la primera clave es siempre la ventana más antigua.
  const windows = new Map<string, { start: number; count: number }>();

  function makeRoom(t: number) {
    if (windows.size < maxKeys) return;
    for (const [k, w] of windows) {
      if (t - w.start >= windowMs) windows.delete(k);
    }
    if (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest !== undefined) windows.delete(oldest);
    }
  }

  return {
    consume(key) {
      const t = now();
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        if (w) windows.delete(key);
        else makeRoom(t);
        windows.set(key, { start: t, count: 1 });
        return { ok: true, remaining: limit - 1 };
      }
      if (w.count >= limit) {
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
      }
      w.count += 1;
      return { ok: true, remaining: limit - w.count };
    },
    size: () => windows.size,
  };
}

// ── Límites de la app ──
// Un limitador por tipo de petición, con ventana de un minuto y límites de
// rateLimitConfig() (env.ts: defaults holgados, ajustables por variable de entorno).
// En globalThis para compartir los contadores aunque el módulo se evalúe en más de un
// bundle del servidor (Route Handlers y Server Actions).
const WINDOW_MS = 60_000;

type Limiters = Record<RateLimitBucket, RateLimiter>;
const globalForRateLimit = globalThis as unknown as { __rateLimiters?: Limiters };

function limiters(): Limiters {
  if (!globalForRateLimit.__rateLimiters) {
    const cfg = rateLimitConfig();
    globalForRateLimit.__rateLimiters = {
      read: createRateLimiter({ limit: cfg.read, windowMs: WINDOW_MS }),
      mutation: createRateLimiter({ limit: cfg.mutation, windowMs: WINDOW_MS }),
      export: createRateLimiter({ limit: cfg.export, windowMs: WINDOW_MS }),
    };
  }
  return globalForRateLimit.__rateLimiters;
}

/** Descuenta una petición del cupo del usuario en ese cubo. */
export function consumeRateLimit(bucket: RateLimitBucket, userId: string): RateLimitResult {
  return limiters()[bucket].consume(userId);
}

/** Como consumeRateLimit, pero lanza AppError RATE_LIMITED (runAction lo devuelve como { ok: false }). */
export function assertRateLimit(bucket: RateLimitBucket, userId: string): void {
  if (!consumeRateLimit(bucket, userId).ok) throw new AppError(RATE_LIMITED_MESSAGE, RATE_LIMITED_CODE);
}

/** Olvida los contadores y vuelve a leer la configuración (tests). */
export function resetRateLimits(): void {
  delete globalForRateLimit.__rateLimiters;
}
