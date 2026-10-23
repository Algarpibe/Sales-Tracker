"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Plus,
  X,
  Check,
  PencilRuler,
  TrendingUp,
  ChevronsUpDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchCategories, fetchSalesData } from "@/lib/data-client";
import { forecastBreakdown, forecastChartPoints, forecastClock, type ForecastChartPoint } from "@/lib/forecast-breakdown";
import { formatUSDCompactIntl, formatUSDWhole } from "@/lib/constants";
import { sumByCategoryYearMonth } from "@/lib/category-series";
import type { ChartTooltipProps } from "@/lib/chart-types";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { ChartFigure } from "@/components/charts/chart-a11y";
import { CHART_HELP } from "@/lib/chart-help";

type RecordType = "SALES_ORDER" | "INVOICE";

interface CategoryInfo {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_COLOR = "#6366f1";

interface ForecastSalesCategoryProps {
  baseYear?: number;
  /** Reloj del forecast; si no llega (widget del dashboard) se fija al montar. */
  now?: Date;
}

// Tooltip fuera del componente (FE-008). Recharts lo clona con active/payload/label y
// conserva estas props extra.
function CategoryForecastTooltip({
  active,
  payload,
  label,
  baseYear,
  selectedCategoryIds,
  catMap,
}: ChartTooltipProps<ForecastChartPoint> & {
  baseYear: number;
  selectedCategoryIds: string[];
  catMap: Map<string, CategoryInfo>;
}) {
  if (active && payload && payload.length) {
    const point = payload[0].payload;
    return (
      <div className="bg-background/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[260px]">
        <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <span className="font-bold text-foreground text-lg">
            {label} {baseYear}
          </span>
        </div>
        <div className="mb-3 flex justify-between items-center text-xs">
          <span className="text-muted-foreground font-bold">Total Forecast:</span>
          <span className="text-emerald-500 font-mono font-bold text-sm">{formatUSDWhole(Number(point?.total_forecast ?? 0))}</span>
        </div>
        <div className="space-y-4">
          {selectedCategoryIds.map((catId, index) => {
              const cat = catMap.get(catId);
              if (!cat) return null;
              const percent = Number(point?.[`${cat.id}_percent`] ?? 0);
              const forecastVal = Number(point?.[`${cat.id}_forecast`] || 0);
              const realSalesVal = Number(point?.[cat.id] || 0);

              return (
                <div key={index} className="space-y-1.5 border-l-2 pl-3 py-1" style={{ borderLeftColor: cat.color }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-foreground">{cat.name}</span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="size-1.5 rounded-full bg-slate-400 opacity-50" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Ventas Reales:</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-400">
                      {formatUSDWhole(realSalesVal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="size-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Proyección:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-foreground">
                        {formatUSDWhole(forecastVal)}
                      </span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 h-3.5 bg-emerald-500/5 text-emerald-400 border-emerald-500/20">
                        {(percent || 0).toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  }
  return null;
}

export function ForecastSalesCategory({ baseYear = new Date().getFullYear(), now: nowProp }: ForecastSalesCategoryProps) {
  const [mountedAt] = useState(() => new Date());
  const now = nowProp ?? mountedAt;
  const [recordType, setRecordType] = useState<RecordType>("SALES_ORDER");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // FE-057: react-query en vez de useEffect + server action. Misma caché de ventas que
  // la página de Análisis (["sales", {}]), filtrada por tipo en cliente. Sin categorías
  // ya no se queda el esqueleto para siempre: se muestra el estado vacío.
  const salesQ = useQuery({ queryKey: ["sales", {}], queryFn: () => fetchSalesData({}) });
  const catsQ = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const isLoading = salesQ.isPending || catsQ.isPending;

  const allCategories = useMemo<CategoryInfo[]>(
    () =>
      (catsQ.data ?? []).map((cat) => ({
        id: String(cat.id),
        name: String(cat.name),
        color: cat.color || DEFAULT_COLOR,
      })),
    [catsQ.data]
  );

  const categoryMonthSums = useMemo(
    () => sumByCategoryYearMonth((salesQ.data ?? []).filter((r) => r.record_type === recordType)),
    [salesQ.data, recordType]
  );
  const sinDatos = allCategories.length === 0 || Object.keys(categoryMonthSums).length === 0;

  const catMap = useMemo(() => {
    const map = new Map<string, CategoryInfo>();
    allCategories.forEach(c => map.set(c.id, c));
    return map;
  }, [allCategories]);

  // Modelo único (ARQ-079): cada categoría con el modelo A y reconciliada para que todas
  // juntas sumen la proyección de la empresa del mismo año y tipo de registro (el de esta
  // tarjeta). Se calcula sobre TODAS las categorías con ventas, no solo las elegidas.
  const breakdown = useMemo(
    () => forecastBreakdown(categoryMonthSums, baseYear, forecastClock(now)),
    [categoryMonthSums, baseYear, now]
  );

  const chartData = useMemo(() => {
    if (Object.keys(categoryMonthSums).length === 0) return [];
    const items = selectedCategoryIds.flatMap((id) => {
      const cat = catMap.get(id);
      return cat ? [{ id, key: id, color: cat.color }] : [];
    });
    return forecastChartPoints(items, breakdown.forecast, breakdown.actual, breakdown.firstProjectedMonth);
  }, [categoryMonthSums, selectedCategoryIds, catMap, breakdown]);

  const selectedCategories = useMemo(() => {
    return selectedCategoryIds.map(id => catMap.get(id)).filter(Boolean) as CategoryInfo[];
  }, [selectedCategoryIds, catMap]);

  const handleToggleCategory = (catId: string) => {
    setSelectedCategoryIds(prev =>
      prev.includes(catId)
        ? prev.filter(id => id !== catId)
        : [...prev, catId]
    );
  };

  if (isLoading) {
    return (
      <Card className="border-t border-t-emerald-500/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden min-h-[500px]">
        <CardContent className="p-8 space-y-6">
          <div className="flex justify-between">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-44" />
          </div>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-500 relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/5 pb-8 space-y-4 md:space-y-0 relative z-20">
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <PencilRuler className="h-6 w-6 text-emerald-400" />
            </div>
            Forecast Estacional por Categoría
            <InfoTooltip text={CHART_HELP.forecastCategoria} />
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Proyección mensual de categorías específicas (Año {baseYear}).
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          
          <RecordTypeToggle
            value={recordType}
            onValueChange={setRecordType}
          />

          <div className="w-px h-8 bg-white/5 hidden sm:block" />

          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger render={
              <Button variant="outline" className="bg-background/40 border-white/10 hover:bg-background/60 h-10 gap-2 font-medium w-full sm:min-w-[250px] justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <ChevronsUpDown className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="truncate">{selectedCategoryIds.length === 0 ? "Seleccionar Categorías..." : `${selectedCategoryIds.length} Categorías`}</span>
                </div>
                <Plus className="h-3 w-3 opacity-50 shrink-0" />
              </Button>
            } />
            <PopoverContent className="w-[300px] p-0 bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl" align="end">
              <Command label="Buscar categorías">
                <CommandInput placeholder="Buscar categorías..." className="h-11" />
                <CommandList>
                  <CommandEmpty>No se encontraron categorías.</CommandEmpty>
                  <CommandGroup heading="Categorías Disponibles">
                    {allCategories.map((cat) => {
                      const isSelected = selectedCategoryIds.includes(cat.id);
                      return (
                        <CommandItem
                          key={cat.id}
                          onSelect={() => handleToggleCategory(cat.id)}
                          className="flex items-center gap-2 py-3"
                        >
                          <div className={cn("flex h-4 w-4 items-center justify-center rounded-sm border border-emerald-500 transition-all", isSelected ? "bg-emerald-500 text-white" : "opacity-50")}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          <span className="flex-1 font-medium">{cat.name}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        <div className="relative z-10 w-full">
          <AnimatePresence>
            {selectedCategories.length > 0 && (
              <motion.div className="flex flex-wrap gap-2 mb-8">
                {selectedCategories.map(cat => (
                  <Badge 
                    key={cat.id}
                    className="bg-white/5 border-white/10 text-foreground py-1 px-3 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                    <button type="button" aria-label={`Quitar ${cat.name}`} onClick={() => handleToggleCategory(cat.id)}>
                      <X className="h-3 w-3 ml-1" />
                    </button>
                  </Badge>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-[450px] w-full relative">
            {sinDatos ? (
              <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-muted-foreground">
                Sin datos para el periodo
              </div>
            ) : selectedCategoryIds.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-6">
                <h4 className="text-xl font-bold">Visualiza el Forecast Detallado</h4>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Selecciona al menos una categoría para calcular su proyección anual con base histórica.
                </p>
              </div>
            ) : (
              <ChartFigure
                label="Forecast Estacional por Categoría"
                summary={{
                  data: chartData,
                  categoryLabel: "Mes",
                  category: (p) => `${p.month} ${baseYear}`,
                  // La línea de forecast total y una barra (ventas reales) por categoría elegida.
                  series: [
                    { label: "Forecast Total", value: (p) => Number(p.total_forecast ?? 0), format: formatUSDWhole },
                    ...selectedCategories.map((cat) => ({
                      label: cat.name,
                      value: (p: ForecastChartPoint) => Number(p[cat.id] ?? 0),
                      format: formatUSDWhole,
                    })),
                  ],
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart accessibilityLayer data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 700 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontWeight: 500 }}
                      tickFormatter={formatUSDCompactIntl}
                    />
                    <RechartsTooltip
                      content={<CategoryForecastTooltip baseYear={baseYear} selectedCategoryIds={selectedCategoryIds} catMap={catMap} />}
                      cursor={{ fill: "rgba(16, 185, 129, 0.1)" }}
                    />
                    <Legend 
                      verticalAlign="top" 
                      align="right" 
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12, paddingBottom: 30, fontWeight: 600, textTransform: 'uppercase' }}
                    />
                    <Line 
                      name="Forecast Total"
                      type="monotone" 
                      dataKey="total_forecast" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      strokeDasharray="8 5"
                      dot={false}
                      activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }}
                      filter="url(#glow-emerald)"
                      animationDuration={2000}
                    />
                    {selectedCategories.map((cat, idx) => (
                      <Bar 
                        key={cat.id}
                        dataKey={cat.id}
                        name={cat.name}
                        stackId="a"
                        fill={cat.color || "#8884d8"}
                        radius={idx === selectedCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        maxBarSize={60}
                        animationDuration={1500}
                      >
                        {idx === selectedCategories.length - 1 && (
                          <LabelList 
                            dataKey={(entry) => selectedCategories.reduce((sum, c) => sum + (entry[c.id] || 0), 0)}
                            position="top" 
                            offset={10}
                            formatter={formatUSDCompactIntl}
                            style={{ fill: "var(--muted-foreground)", fontSize: 10, fontWeight: 600 }}
                          />
                        )}
                      </Bar>
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartFigure>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
