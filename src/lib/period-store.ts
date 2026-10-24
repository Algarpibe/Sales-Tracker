import { parseStoredPeriod, type Period } from "@/lib/period";

export const PERIOD_STORAGE_KEY = "salestracker.period";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultPeriod(): Period {
  return { tipo: "INVOICE", year: new Date().getFullYear() };
}

/**
 * Periodo seleccionado (tipo y año) persistido en localStorage, como store externo para
 * useSyncExternalStore (FE-008: sin setState dentro de un efecto de montaje).
 *
 * La instantánea es el texto crudo guardado (un string es estable entre lecturas) y el
 * servidor siempre ve `null`, es decir, el periodo por defecto. Durante la hidratación
 * React usa también la instantánea del servidor, así que el HTML coincide (sin React
 * #418) y justo después vuelve a pintar con el periodo guardado.
 *
 * Se lee el almacenamiento una sola vez y después manda la copia en memoria: si el
 * navegador lo bloquea (modo privado, cuota), el periodo sigue funcionando en la pestaña.
 */
export function createPeriodStore(getStorage: () => StorageLike | null) {
  // undefined = todavía no se ha leído el almacenamiento.
  let cache: string | null | undefined;
  const listeners = new Set<() => void>();

  function getSnapshot(): string | null {
    if (cache === undefined) {
      try {
        cache = getStorage()?.getItem(PERIOD_STORAGE_KEY) ?? null;
      } catch {
        cache = null;
      }
    }
    return cache;
  }

  function getServerSnapshot(): string | null {
    return null;
  }

  function read(raw: string | null): Period {
    return parseStoredPeriod(raw, defaultPeriod());
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function update(change: (p: Period) => Period): void {
    const raw = JSON.stringify(change(read(getSnapshot())));
    cache = raw;
    try {
      getStorage()?.setItem(PERIOD_STORAGE_KEY, raw);
    } catch {
      // Sin almacenamiento: el cambio vale para esta pestaña, pero no se recuerda.
    }
    listeners.forEach((l) => l());
  }

  return { getSnapshot, getServerSnapshot, read, subscribe, update };
}
