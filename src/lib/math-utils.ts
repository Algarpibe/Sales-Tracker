/**
 * Calcula la regresión lineal simple para un conjunto de valores.
 * @param data Array de números representing y-values (e.g., ventas mensuales)
 * @returns slope (pendiente) e intercept (intersección)
 */
export function calculateLinearRegression(data: number[]) {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0] || 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = data[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * Genera puntos de tendencia basados en los datos históricos.
 */
export function getTrendPoints(data: number[], pointsCount: number = 12) {
  const { slope, intercept } = calculateLinearRegression(data);
  const points = [];
  for (let i = 0; i < pointsCount; i++) {
    points.push(Math.max(0, slope * i + intercept));
  }
  return points;
}

/**
 * Calcula el Run-Rate estimado al cierre de mes.
 */
export function calculateRunRate(currentTotal: number, currentDay: number, totalDays: number) {
  if (currentDay <= 0) return currentTotal;
  const dailyAvg = currentTotal / currentDay;
  return dailyAvg * totalDays;
}
