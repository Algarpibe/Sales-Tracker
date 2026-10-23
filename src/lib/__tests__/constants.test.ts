import { describe, it, expect, vi, afterEach } from "vitest";
import {
  HISTORY_FIRST_YEAR,
  HUB_FIRST_YEAR,
  MONTHS,
  MONTH_LABELS,
  formatUSDCompactIntl,
  formatUSDWhole,
  getYearRange,
} from "@/lib/constants";
import { HISTORY_FIRST_YEAR as HISTORY_FIRST_YEAR_VALIDATION } from "@/lib/validation";

afterEach(() => {
  vi.useRealTimers();
});

describe("años de arranque", () => {
  it("el hub arranca en 2021 y el histórico de clientes en 2015", () => {
    expect(HUB_FIRST_YEAR).toBe(2021);
    expect(HISTORY_FIRST_YEAR).toBe(2015);
  });

  it("validation reexporta el mismo HISTORY_FIRST_YEAR (una sola fuente)", () => {
    expect(HISTORY_FIRST_YEAR_VALIDATION).toBe(HISTORY_FIRST_YEAR);
  });

  it("getYearRange va del año actual hacia atrás hasta HUB_FIRST_YEAR", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1));
    expect(getYearRange()).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
  });
});

describe("MONTH_LABELS", () => {
  it("son las 12 etiquetas cortas de MONTHS, en orden", () => {
    expect(MONTH_LABELS).toEqual(["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]);
    expect(MONTH_LABELS).toEqual(MONTHS.map((m) => m.label));
  });
});

describe("formateo de dólares", () => {
  it("formatUSDWhole redondea a dólares enteros con separador de miles", () => {
    expect(formatUSDWhole(1234.56)).toBe("$1,235");
    expect(formatUSDWhole(0)).toBe("$0");
  });

  it("formatUSDCompactIntl usa la notación compacta de Intl con un decimal", () => {
    expect(formatUSDCompactIntl(1234)).toBe("$1.2K");
    expect(formatUSDCompactIntl(1_500_000)).toBe("$1.5M");
    expect(formatUSDCompactIntl(950)).toBe("$950");
  });
});
