"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { Tipo } from "@/lib/period";
import { createPeriodStore } from "@/lib/period-store";

interface PeriodCtx {
  tipo: Tipo;
  setTipo: (t: Tipo) => void;
  year: number;
  setYear: (y: number) => void;
}

const Ctx = createContext<PeriodCtx | null>(null);

// Un solo store por pestaña. En el servidor no hay window: la instantánea del servidor
// no lee el almacenamiento, y nadie llama a update() durante un render de servidor.
const store = createPeriodStore(() => (typeof window === "undefined" ? null : window.localStorage));

// Estables (fuera del componente): hay consumidores que los ponen en deps de efectos.
const setTipo = (tipo: Tipo) => store.update((p) => ({ ...p, tipo }));
const setYear = (year: number) => store.update((p) => ({ ...p, year }));

export function usePeriod(): PeriodCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePeriod debe usarse dentro de <PeriodProvider>");
  return c;
}

/**
 * Periodo (tipo y año) compartido por los módulos y recordado en localStorage. Se lee
 * con useSyncExternalStore (FE-008): el servidor y la hidratación usan el periodo por
 * defecto, así que el HTML coincide (sin React #418), y justo después React vuelve a
 * pintar con el guardado. Mismo criterio que useAuth en auth-provider.tsx.
 */
export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const raw = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const value = useMemo(() => {
    const { tipo, year } = store.read(raw);
    return { tipo, setTipo, year, setYear };
  }, [raw]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
