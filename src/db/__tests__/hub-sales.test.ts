import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * getHubSalesRows agrega todo el histórico del hub. Aquí se fija que N lecturas
 * simultáneas comparten UNA consulta, que el resultado se cachea 30 s y que un
 * fallo no se queda cacheado. El pool del hub se sustituye por un doble en memoria.
 */

const state = vi.hoisted(() => ({
  calls: 0,
  // Cada consulta toma la siguiente respuesta pendiente; se resuelven a mano.
  pending: [] as { resolve: (v: { rows: unknown[] }) => void; reject: (e: unknown) => void }[],
}));

vi.mock("@/db/hub", () => ({
  getHubPool: () => ({
    query: () => {
      state.calls += 1;
      return new Promise((resolve, reject) => state.pending.push({ resolve, reject }));
    },
  }),
}));

const FILA = { category_name: "Equipos", record_type: "INVOICE", record_month: 3, record_year: 2025, amount_usd: "10.5" };

async function cargarModulo() {
  // Módulo nuevo en cada prueba: la caché y la consulta en vuelo son estado de módulo.
  vi.resetModules();
  return import("@/db/hub-sales");
}

// Deja correr las microtareas pendientes (then/finally encadenados).
const vaciarMicrotareas = () => new Promise((r) => setTimeout(r, 0));

let ahora = 1_000_000;

beforeEach(() => {
  state.calls = 0;
  state.pending = [];
  ahora = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => ahora);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getHubSalesRows", () => {
  it("N llamadas simultáneas comparten una sola consulta al hub", async () => {
    const { getHubSalesRows } = await cargarModulo();

    const llamadas = Array.from({ length: 5 }, () => getHubSalesRows());
    await vaciarMicrotareas();
    expect(state.calls).toBe(1);

    state.pending[0].resolve({ rows: [FILA] });
    const resultados = await Promise.all(llamadas);

    expect(state.calls).toBe(1);
    for (const r of resultados) {
      expect(r).toEqual([{ ...FILA, amount_usd: 10.5 }]);
    }
  });

  it("dentro del TTL sirve la caché sin consultar; al vencer vuelve a consultar", async () => {
    const { getHubSalesRows } = await cargarModulo();

    const primera = getHubSalesRows();
    await vaciarMicrotareas();
    state.pending[0].resolve({ rows: [FILA] });
    await primera;
    expect(state.calls).toBe(1);

    ahora += 29_000;
    await getHubSalesRows();
    expect(state.calls).toBe(1);

    ahora += 2_000; // 31 s desde la carga: la caché ya venció
    const tercera = getHubSalesRows();
    await vaciarMicrotareas();
    expect(state.calls).toBe(2);
    state.pending[1].resolve({ rows: [] });
    await expect(tercera).resolves.toEqual([]);
  });

  it("un fallo se propaga a todos los que esperaban y no se cachea: la siguiente llamada reintenta", async () => {
    const { getHubSalesRows } = await cargarModulo();

    const a = getHubSalesRows();
    const b = getHubSalesRows();
    await vaciarMicrotareas();
    expect(state.calls).toBe(1);

    state.pending[0].reject(new Error("canceling statement due to statement timeout"));
    await expect(a).rejects.toThrow("statement timeout");
    await expect(b).rejects.toThrow("statement timeout");

    const c = getHubSalesRows();
    await vaciarMicrotareas();
    expect(state.calls).toBe(2);
    state.pending[1].resolve({ rows: [FILA] });
    await expect(c).resolves.toHaveLength(1);
  });
});
