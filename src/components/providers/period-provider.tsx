"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { parseStoredPeriod, type Tipo } from "@/lib/period";

const KEY = "salestracker.period";

interface PeriodCtx {
  tipo: Tipo;
  setTipo: (t: Tipo) => void;
  year: number;
  setYear: (y: number) => void;
}

const Ctx = createContext<PeriodCtx | null>(null);

export function usePeriod(): PeriodCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePeriod debe usarse dentro de <PeriodProvider>");
  return c;
}

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [tipo, setTipo] = useState<Tipo>("INVOICE");
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const p = parseStoredPeriod(localStorage.getItem(KEY), { tipo: "INVOICE", year: new Date().getFullYear() });
    setTipo(p.tipo);
    setYear(p.year);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ tipo, year }));
    } catch {}
  }, [tipo, year, hydrated]);

  return <Ctx.Provider value={{ tipo, setTipo, year, setYear }}>{children}</Ctx.Provider>;
}
