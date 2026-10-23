/**
 * Calcula el Run-Rate estimado al cierre de mes.
 */
export function calculateRunRate(currentTotal: number, currentDay: number, totalDays: number) {
  if (currentDay <= 0) return currentTotal;
  const dailyAvg = currentTotal / currentDay;
  return dailyAvg * totalDays;
}

/**
 * Calculates seasonality factors based on historical monthly data.
 * @param historicalData Array of arrays, where each sub-array is 12 months of sales for a year.
 * @returns Array of 12 numbers (0-1) summing to 1.
 */
export function calculateSeasonalityFactors(historicalData: number[][], weights?: number[]): number[] {
  const n = historicalData.length;
  if (n === 0) return Array(12).fill(1 / 12);

  const monthlySums = Array(12).fill(0);
  let weightSum = 0;

  historicalData.forEach((yearData, idx) => {
    const yearTotal = yearData.reduce((a, b) => a + b, 0);
    if (yearTotal === 0) return;
    const wgt = weights?.[idx] ?? 1;
    weightSum += wgt;
    yearData.forEach((amount, monthIndex) => {
      // Peso de cada mes = su cuota del año, ponderada por recencia del año.
      monthlySums[monthIndex] += (amount / yearTotal) * wgt;
    });
  });

  if (weightSum === 0) return Array(12).fill(1 / 12);

  const factors = monthlySums.map((sum) => sum / weightSum);
  const factorsSum = factors.reduce((a, b) => a + b, 0);
  return factors.map((f) => f / (factorsSum || 1));
}
