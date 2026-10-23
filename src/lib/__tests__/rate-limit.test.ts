import { describe, it, expect, afterEach, vi } from "vitest";
import { AppError, RATE_LIMITED_CODE, RATE_LIMITED_MESSAGE } from "@/lib/errors";
import { assertRateLimit, consumeRateLimit, createRateLimiter, resetRateLimits } from "@/lib/rate-limit";

/**
 * SEC-006: límite por USUARIO (id de sesión, no IP) para las lecturas de /api/data y
 * las mutaciones. Ventana fija con reloj inyectable: la ventana empieza con la primera
 * petición y se reinicia sola al cumplirse, haya o no tráfico (a diferencia del
 * contador de better-auth, que solo se reinicia tras `window` s sin peticiones).
 */

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createRateLimiter", () => {
  it("deja pasar hasta el límite dentro de la ventana y corta la siguiente", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect(rl.consume("u1")).toEqual({ ok: true, remaining: 2 });
    expect(rl.consume("u1")).toEqual({ ok: true, remaining: 1 });
    expect(rl.consume("u1")).toEqual({ ok: true, remaining: 0 });
    expect(rl.consume("u1")).toMatchObject({ ok: false });
  });

  it("se reinicia al cumplirse la ventana aunque el tráfico haya sido continuo", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
    rl.consume("u1");
    rl.consume("u1");
    for (let i = 0; i < 5; i++) {
      c.advance(10_000);
      expect(rl.consume("u1").ok).toBe(false);
    }
    c.advance(10_000); // 60 s desde la primera petición
    expect(rl.consume("u1")).toEqual({ ok: true, remaining: 1 });
  });

  it("las peticiones rechazadas no alargan la ventana", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    rl.consume("u1");
    c.advance(59_999);
    expect(rl.consume("u1").ok).toBe(false);
    c.advance(1);
    expect(rl.consume("u1").ok).toBe(true);
  });

  it("cada usuario tiene su propio contador", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    expect(rl.consume("u1").ok).toBe(true);
    expect(rl.consume("u1").ok).toBe(false);
    expect(rl.consume("u2").ok).toBe(true);
  });

  it("Retry-After: segundos que faltan para que acabe la ventana, redondeando hacia arriba", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    rl.consume("u1");
    c.advance(15_500);
    expect(rl.consume("u1")).toEqual({ ok: false, retryAfterSeconds: 45 });
    c.advance(44_400); // faltan 100 ms
    expect(rl.consume("u1")).toEqual({ ok: false, retryAfterSeconds: 1 });
  });

  it("borra las claves caducadas al llenarse y no pasa del tope de claves", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 3, now: c.now });
    rl.consume("a");
    rl.consume("b");
    c.advance(60_000); // a y b caducan
    rl.consume("c");
    rl.consume("d"); // lleno (a, b, c): barre a y b
    expect(rl.size()).toBe(2);
    rl.consume("e");
    rl.consume("f"); // lleno sin caducadas (c, d, e): sale la más antigua (c)
    expect(rl.size()).toBe(3);
  });

  it("con el tope lleno y nada caducado, expulsa la ventana más antigua", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2, now: c.now });
    rl.consume("a");
    rl.consume("b");
    rl.consume("c"); // expulsa a
    expect(rl.size()).toBe(2);
    expect(rl.consume("b").ok).toBe(false); // b sigue contada
    expect(rl.consume("a").ok).toBe(true); // a empezó de cero (expulsa b, la más antigua)
  });

  it("rechaza configuraciones sin sentido", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow();
    expect(() => createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 0 })).toThrow();
  });
});

describe("límites de la app por tipo de petición", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetRateLimits();
  });

  it("los cubos (lecturas, mutaciones, exportaciones) son independientes", () => {
    vi.stubEnv("RATE_LIMIT_READS_PER_MINUTE", "1");
    vi.stubEnv("RATE_LIMIT_MUTATIONS_PER_MINUTE", "1");
    vi.stubEnv("RATE_LIMIT_EXPORTS_PER_MINUTE", "1");
    resetRateLimits();
    expect(consumeRateLimit("read", "u1").ok).toBe(true);
    expect(consumeRateLimit("read", "u1").ok).toBe(false);
    expect(consumeRateLimit("mutation", "u1").ok).toBe(true);
    expect(consumeRateLimit("export", "u1").ok).toBe(true);
    expect(consumeRateLimit("export", "u1").ok).toBe(false);
  });

  it("assertRateLimit lanza un AppError RATE_LIMITED con el mensaje para el usuario", () => {
    vi.stubEnv("RATE_LIMIT_MUTATIONS_PER_MINUTE", "1");
    resetRateLimits();
    expect(() => assertRateLimit("mutation", "u1")).not.toThrow();
    let err: unknown;
    try {
      assertRateLimit("mutation", "u1");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: RATE_LIMITED_CODE, message: RATE_LIMITED_MESSAGE });
  });

  it("sin variables de entorno usa los valores por defecto (holgados)", () => {
    for (let i = 0; i < 600; i++) expect(consumeRateLimit("read", "u1").ok).toBe(true);
    expect(consumeRateLimit("read", "u1").ok).toBe(false);
  });
});
