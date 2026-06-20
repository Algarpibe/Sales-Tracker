// Tipos mínimos para los callbacks de recharts (tooltips), que de otro modo serían
// `any`. P es la forma del data point bajo `payload`.
export type ChartTooltipEntry<P = Record<string, unknown>> = {
  dataKey?: string | number;
  name?: string | number;
  value?: number;
  color?: string;
  fill?: string;
  payload?: P;
};

export type ChartTooltipProps<P = Record<string, unknown>> = {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipEntry<P>[];
};
