"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ChevronsUpDown, X, LayoutTemplate, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { ChartFigure } from "@/components/charts/chart-a11y";
import { CHART_HELP } from "@/lib/chart-help";
import { HUB_FIRST_YEAR, formatUSDWhole } from "@/lib/constants";
import { buildHistoricalCategorySeries, type CategoryChartPoint } from "@/lib/category-series";
import { fetchCategories, fetchSalesData } from "@/lib/data-client";
import type { ChartTooltipEntry, ChartTooltipProps } from "@/lib/chart-types";

// --- Types ---
type RecordType = "SALES_ORDER" | "INVOICE";
type ViewMode = "ANNUAL" | "MONTHLY" | "QUARTERLY";

interface CategoryInfo {
  id: string;
  name: string;
  color: string;
}

// Fallback color if a category has no color set
const DEFAULT_COLOR = "#6366f1";

// Tooltip fuera del componente (FE-008: no se crean componentes en cada render).
// Recharts clona el elemento con active/payload/label y conserva estas props extra.
function HistoricalTooltip({
  active,
  payload,
  label,
  viewMode,
  year,
  catMap,
}: ChartTooltipProps & { viewMode: ViewMode; year: number | null; catMap: Map<string, CategoryInfo> }) {
  if (active && payload && payload.length) {
    const sortedPayload = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const total = sortedPayload.reduce((sum: number, entry) => sum + (entry.value ?? 0), 0);
    // Con muchas categorías el tooltip crecía tanto que el total quedaba fuera de
    // pantalla: ahora va en la cabecera y la lista se acota con un resumen del resto.
    const MAX_ROWS = 12;
    const shown = sortedPayload.slice(0, MAX_ROWS);
    const rest = sortedPayload.slice(MAX_ROWS);
    const restTotal = rest.reduce((sum: number, entry) => sum + (entry.value ?? 0), 0);

    return (
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/5 dark:border-white/5 p-4 rounded-xl shadow-2xl min-w-[240px]">
        <div className="mb-3 flex items-baseline justify-between gap-6 border-b border-black/5 dark:border-white/5 pb-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
            {viewMode === "ANNUAL" ? label : `${label} ${year}`}
          </h3>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Total</div>
            <div className="font-mono font-bold text-primary">{formatUSDWhole(total)}</div>
          </div>
        </div>
        <div className="space-y-2">
          {shown.map((entry: ChartTooltipEntry, index: number) => {
            const category = catMap.get(String(entry.dataKey));
            return (
              <div key={`item-${index}`} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-slate-500 truncate max-w-[140px]">
                    {category?.name || entry.name}
                  </span>
                </div>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {formatUSDWhole(entry.value ?? 0)}
                </span>
              </div>
            );
          })}
        </div>
        {rest.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-2 text-sm text-slate-400 dark:border-white/5">
            <span>+{rest.length} categorías más</span>
            <span className="font-mono">{formatUSDWhole(restTotal)}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function HistoricalSalesCategory() {
  const [recordType, setRecordType] = useState<RecordType>("SALES_ORDER");
  const [viewMode, setViewMode] = useState<ViewMode>("ANNUAL");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [openPopover, setOpenPopover] = useState(false);
  // null = el usuario aún no eligió: se usa el último año con datos.
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // FE-057: react-query en vez de useEffect + server action. Se reutiliza la caché de
  // todas las ventas (["sales", {}], la misma que la página de Análisis) y se filtra
  // por tipo en cliente: cambiar OV/FAC ya no vuelve a pedir nada. Sin categorías ya
  // no se queda el esqueleto para siempre: se muestra el estado vacío.
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

  const series = useMemo(
    () =>
      buildHistoricalCategorySeries(
        (salesQ.data ?? []).filter((r) => r.record_type === recordType),
        HUB_FIRST_YEAR
      ),
    [salesQ.data, recordType]
  );
  const availableYears = series.years;
  const effectiveYear = selectedYear ?? availableYears[availableYears.length - 1] ?? null;

  // Category lookup helper
  const catMap = useMemo(() => {
    const map = new Map<string, CategoryInfo>();
    allCategories.forEach(c => map.set(c.id, c));
    return map;
  }, [allCategories]);

  const handleToggleCategory = (catId: string) => {
    setSelectedCategoryIds(prev =>
      prev.includes(catId)
        ? prev.filter(id => id !== catId)
        : [...prev, catId]
    );
  };

  const handleClearCategories = () => setSelectedCategoryIds([]);

  // Selected category objects in order
  const selectedCategories = useMemo(() => {
    return selectedCategoryIds
      .map(id => catMap.get(id))
      .filter(Boolean) as CategoryInfo[];
  }, [selectedCategoryIds, catMap]);

  const currentChartData = useMemo<CategoryChartPoint[]>(() => {
    if (viewMode === "ANNUAL") return series.annual;
    if (viewMode === "QUARTERLY") return effectiveYear ? series.quarterly[effectiveYear] || [] : [];
    return effectiveYear ? series.monthly[effectiveYear] || [] : [];
  }, [viewMode, series, effectiveYear]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="h-[400px] w-full mt-8 flex flex-col justify-end space-y-2">
          <div className="flex justify-between items-end h-full gap-4 px-10 pb-6 border-b border-white/5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col justify-end w-full space-y-1">
                <Skeleton className="h-12 w-full bg-white/5 rounded-sm" />
                <Skeleton className="h-24 w-full bg-white/10 rounded-sm" />
                <Skeleton className="h-16 w-full bg-white/5 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (availableYears.length === 0 || allCategories.length === 0) {
      return (
        <div className="h-[400px] w-full mt-8 flex items-center justify-center text-center text-sm text-muted-foreground">
          Sin datos para el periodo
        </div>
      );
    }

    if (selectedCategoryIds.length === 0) {
      return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-[400px] w-full mt-8 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-white/10 rounded-2xl bg-white/5"
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <LayoutTemplate className="h-8 w-8 text-primary/50" />
          </div>
          <h3 className="text-xl font-bold text-foreground">No hay categorías seleccionadas</h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Selecciona al menos una categoría del menú desplegable para empezar a visualizar la evolución.
          </p>
        </motion.div>
      );
    }

    return (
      <motion.div
        key={`${recordType}-${viewMode}-${effectiveYear}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-[400px] w-full mt-8"
      >
        <ChartFigure
          label={`Histórico ${viewMode === "MONTHLY" ? "Mensual" : viewMode === "QUARTERLY" ? "Trimestral" : "Anual"}`}
          summary={{
            data: currentChartData,
            categoryLabel: viewMode === "ANNUAL" ? "Año" : viewMode === "QUARTERLY" ? "Trimestre" : "Mes",
            // Como el tooltip: trimestre y mes llevan el año elegido.
            category: (p) =>
              viewMode === "ANNUAL"
                ? String(p.year)
                : `${viewMode === "QUARTERLY" ? p.quarter : p.month} ${effectiveYear}`,
            // Una columna por categoría elegida (las mismas barras) y el total del tooltip.
            series: [
              ...selectedCategories.map((cat) => ({
                label: cat.name,
                value: (p: CategoryChartPoint) => Number(p[cat.id] ?? 0),
                format: formatUSDWhole,
              })),
              {
                label: "Total",
                value: (p: CategoryChartPoint) => selectedCategories.reduce((sum, cat) => sum + Number(p[cat.id] ?? 0), 0),
                format: formatUSDWhole,
              },
            ],
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={currentChartData}
              margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
              barSize={viewMode === "MONTHLY" ? 30 : 45}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="color-mix(in oklch, var(--muted-foreground) 10%, transparent)" />
              <XAxis
                dataKey={viewMode === "ANNUAL" ? "year" : viewMode === "QUARTERLY" ? "quarter" : "month"}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                dx={-10}
              />
              <Tooltip content={<HistoricalTooltip viewMode={viewMode} year={effectiveYear} catMap={catMap} />} cursor={{ fill: 'rgba(147, 197, 253, 0.15)' }} />

              {selectedCategories.map((category, index) => (
                <Bar
                  key={category.id}
                  dataKey={category.id}
                  name={category.name}
                  stackId="a"
                  fill={category.color}
                  radius={
                    index === selectedCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                  }
                  animationDuration={1500}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartFigure>
      </motion.div>
    );
  };

  return (
    <Card className="col-span-1 border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <CardHeader className="border-b border-white/5 pb-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Histórico {viewMode === "MONTHLY" ? "Mensual" : viewMode === "QUARTERLY" ? "Trimestral" : "Anual"}
              <InfoTooltip text={CHART_HELP.historicoCategoria} />
            </CardTitle>
              {viewMode === "ANNUAL"
                ? (availableYears.length > 0
                    ? `Evolución de ventas anuales segmentadas (${availableYears[0]}–${availableYears[availableYears.length - 1]}).`
                    : "Evolución de ventas anuales segmentadas.")
                : `Evolución ${viewMode === "QUARTERLY" ? "trimestral" : "mensual"} del año ${effectiveYear ?? ""} para categorías seleccionadas.`}
          </div>

          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full lg:w-auto">
            
            {/* Selector de resolución: mismo diseño que el de Evolución Histórica por
                Grupo (inline-flex, sin grid). `grid-cols-3` equivale a
                `minmax(0, 1fr)` y deja que las columnas se encojan por debajo del
                texto, que es lo que solapaba ANUAL/TRIMESTRAL/MENSUAL. */}
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
              className="w-auto"
            >
              <TabsList className="bg-muted/30 backdrop-blur-sm border border-white/5 h-10 p-1">
                <TabsTrigger value="ANNUAL" className="text-[10px] h-8 font-bold uppercase tracking-wider">Anual</TabsTrigger>
                <TabsTrigger value="QUARTERLY" className="text-[10px] h-8 font-bold uppercase tracking-wider">Trimestral</TabsTrigger>
                <TabsTrigger value="MONTHLY" className="text-[10px] h-8 font-bold uppercase tracking-wider">Mensual</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="w-px h-6 bg-white/10 hidden sm:block" />

            {/* Record Type Toggle */}
            <RecordTypeToggle
              value={recordType}
              onValueChange={setRecordType}
            />

            {/* Category selection */}
            <Popover open={openPopover} onOpenChange={setOpenPopover}>
              <PopoverTrigger className="inline-flex items-center justify-between w-full sm:w-[250px] px-3 py-2 text-sm bg-black/20 border border-white/10 hover:bg-black/40 transition-all shadow-sm rounded-xl text-foreground cursor-pointer h-10">
                  <span className="truncate flex-1 text-left">
                    {selectedCategoryIds.length === 0 ? "Seleccionar Categorías..." : `${selectedCategoryIds.length} seleccionadas`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0 bg-background/95 backdrop-blur-xl border-white/10 rounded-xl" align="end">
                <Command label="Buscar categorías">
                    <CommandInput placeholder="Buscar..." />
                    <CommandList>
                        <CommandEmpty>No hay resultados.</CommandEmpty>
                        <CommandGroup>
                        {allCategories.map((category) => (
                            <CommandItem
                                key={category.id}
                                onSelect={() => handleToggleCategory(category.id)}
                            >
                                <div className={cn(
                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border transition-all",
                                    selectedCategoryIds.includes(category.id) ? "bg-primary border-primary text-primary-foreground" : "border-white/20 opacity-50 [&_svg]:invisible"
                                )}>
                                    <Check className="h-3 w-3" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
                                    <span>{category.name}</span>
                                </div>
                            </CommandItem>
                        ))}
                        </CommandGroup>
                    </CommandList>
                    {/* Acción fija al pie: vaciar la selección de una vez, sin ir
                        desmarcando una a una (los chips quedan tapados por el popover). */}
                    {selectedCategoryIds.length > 0 && (
                      <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2 py-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          {selectedCategoryIds.length} seleccionada{selectedCategoryIds.length === 1 ? "" : "s"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearCategories}
                          className="h-6 text-[11px] text-muted-foreground hover:text-destructive"
                        >
                          <X className="mr-1 h-3 w-3" /> Limpiar todo
                        </Button>
                      </div>
                    )}
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* YEAR SELECTION - BUTTON BOX (Only in Monthly/Quarterly View) */}
        <AnimatePresence>
          {viewMode !== "ANNUAL" && (
            <motion.div
               initial={{ opacity: 0, y: -10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               className="mt-6 flex flex-wrap items-center gap-2 p-1.5 bg-black/5 dark:bg-white/5 rounded-2xl w-fit"
            >
              {availableYears.map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={cn(
                    "px-4 py-2 text-sm font-bold rounded-xl transition-all duration-300",
                    effectiveYear === year 
                      ? "bg-primary text-primary-foreground shadow-lg scale-105" 
                      : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  )}
                >
                  {year}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected Badges */}
        <AnimatePresence>
          {selectedCategories.length > 0 && (
            <motion.div className="flex flex-wrap items-center gap-2 pt-6">
              {selectedCategories.map(cat => (
                <Badge key={cat.id} variant="secondary" className="bg-white/5 border-white/10 pr-1.5 py-1">
                  <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                  <button type="button" aria-label={`Quitar ${cat.name}`} onClick={() => handleToggleCategory(cat.id)} className="ml-2 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={handleClearCategories} className="h-6 text-[10px] text-muted-foreground">
                Limpiar todo
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardHeader>
      <CardContent>
        {renderContent()}
      </CardContent>
    </Card>
  );
}
