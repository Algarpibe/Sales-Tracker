// Fixture sintético compartido por los tests del forecast (ARQ-079). Tres categorías
// inventadas con formas distintas, histórico 2023-2025 y año en curso 2026 con el
// reloj fijo a mitad de junio. Nada de esto son datos reales.

/** año → mes (1-12) → importe. */
export type FixtureMonths = Record<number, Record<number, number>>;

const toMonths = (values: number[]): Record<number, number> =>
  Object.fromEntries(values.map((v, i) => [i + 1, v]));

const scale = (profile: number[], k: number) => profile.map((v) => v * k);

// Alfa: crece año a año, pico en el último trimestre.
const ALFA = [80, 80, 90, 90, 100, 100, 100, 100, 110, 120, 130, 150].map((v) => v * 1000);
// Beta: concentrada en el primer trimestre y en retroceso.
const BETA = [200, 180, 160, 120, 100, 80, 60, 60, 80, 100, 120, 140].map((v) => v * 1000);

// 15 de junio de 2026: mes en curso a mitad (día 15 de 30).
export const FIXTURE_NOW = new Date(2026, 5, 15);
export const FIXTURE_YEAR = 2026;

export const FIXTURE_SERIES: Record<string, FixtureMonths> = {
  alfa: {
    2023: toMonths(scale(ALFA, 1)),
    2024: toMonths(scale(ALFA, 1.1)),
    2025: toMonths(scale(ALFA, 1.2)),
    // Ene-May cerrados; junio con medio mes (MTD).
    2026: toMonths([...scale(ALFA, 1.35).slice(0, 5), 1.35 * 100_000 * 0.5]),
  },
  beta: {
    2023: toMonths(scale(BETA, 1)),
    2024: toMonths(scale(BETA, 0.95)),
    2025: toMonths(scale(BETA, 0.9)),
    2026: toMonths([...scale(BETA, 0.8).slice(0, 5), 0.8 * 80_000 * 0.4]),
  },
  // Gamma: pequeña, irregular y con meses a cero.
  gamma: {
    2023: toMonths([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50_000]),
    2024: toMonths([0, 0, 10_000, 0, 0, 20_000, 0, 0, 30_000, 0, 0, 40_000]),
    2025: toMonths(Array.from({ length: 12 }, () => 10_000)),
    2026: toMonths([30_000, 30_000, 30_000, 30_000, 30_000, 20_000]),
  },
};
