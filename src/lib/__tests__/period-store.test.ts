import { describe, it, expect, vi } from "vitest";
import { createPeriodStore, PERIOD_STORAGE_KEY } from "@/lib/period-store";

/** localStorage en memoria; `rota` simula un navegador que bloquea el almacenamiento. */
function storage(inicial: Record<string, string> = {}, rota = false) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: vi.fn((k: string) => {
      if (rota) throw new Error("SecurityError");
      return datos.get(k) ?? null;
    }),
    setItem: vi.fn((k: string, v: string) => {
      if (rota) throw new Error("QuotaExceededError");
      datos.set(k, v);
    }),
  };
}

const AHORA = new Date().getFullYear();

describe("createPeriodStore", () => {
  it("sin nada guardado devuelve el periodo por defecto", () => {
    const store = createPeriodStore(() => storage());
    expect(store.read(store.getSnapshot())).toEqual({ tipo: "INVOICE", year: AHORA });
  });

  it("lee el periodo guardado", () => {
    const s = storage({ [PERIOD_STORAGE_KEY]: JSON.stringify({ tipo: "SALES_ORDER", year: 2024 }) });
    const store = createPeriodStore(() => s);
    expect(store.read(store.getSnapshot())).toEqual({ tipo: "SALES_ORDER", year: 2024 });
  });

  it("la instantánea del servidor es siempre la de por defecto, sin tocar el almacenamiento", () => {
    const s = storage({ [PERIOD_STORAGE_KEY]: JSON.stringify({ tipo: "SALES_ORDER", year: 2024 }) });
    const store = createPeriodStore(() => s);
    expect(store.read(store.getServerSnapshot())).toEqual({ tipo: "INVOICE", year: AHORA });
    expect(s.getItem).not.toHaveBeenCalled();
  });

  it("la instantánea es estable entre lecturas (useSyncExternalStore no entra en bucle)", () => {
    const s = storage({ [PERIOD_STORAGE_KEY]: JSON.stringify({ tipo: "SALES_ORDER", year: 2024 }) });
    const store = createPeriodStore(() => s);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(s.getItem).toHaveBeenCalledTimes(1);
  });

  it("update guarda el cambio, conserva el resto del periodo y avisa a los suscriptores", () => {
    const s = storage({ [PERIOD_STORAGE_KEY]: JSON.stringify({ tipo: "SALES_ORDER", year: 2024 }) });
    const store = createPeriodStore(() => s);
    const aviso = vi.fn();
    const baja = store.subscribe(aviso);

    store.update((p) => ({ ...p, year: 2025 }));

    expect(store.read(store.getSnapshot())).toEqual({ tipo: "SALES_ORDER", year: 2025 });
    expect(JSON.parse(s.datos.get(PERIOD_STORAGE_KEY)!)).toEqual({ tipo: "SALES_ORDER", year: 2025 });
    expect(aviso).toHaveBeenCalledTimes(1);

    baja();
    store.update((p) => ({ ...p, tipo: "INVOICE" }));
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("si el navegador bloquea el almacenamiento, el periodo sigue funcionando en memoria", () => {
    const store = createPeriodStore(() => storage({}, true));
    expect(store.read(store.getSnapshot())).toEqual({ tipo: "INVOICE", year: AHORA });
    store.update((p) => ({ ...p, tipo: "SALES_ORDER" }));
    expect(store.read(store.getSnapshot())).toEqual({ tipo: "SALES_ORDER", year: AHORA });
  });

  it("sin almacenamiento (servidor) no lanza", () => {
    const store = createPeriodStore(() => null);
    expect(store.read(store.getSnapshot())).toEqual({ tipo: "INVOICE", year: AHORA });
    expect(() => store.update((p) => ({ ...p, year: 2023 }))).not.toThrow();
  });
});
