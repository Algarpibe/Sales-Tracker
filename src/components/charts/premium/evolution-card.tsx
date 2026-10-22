"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordTypeToggle, type RecordTypeValue } from "@/components/common/record-type-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  BarChart3,
  Plus,
  X,
  Check,
  History,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { seleccionInicialIds, type SeleccionInicial } from "@/lib/evolution-card";
import type { GroupingAnalysisResult, RecordType } from "@/types/database";
import type { ChartTooltipEntry, ChartTooltipProps } from "@/lib/chart-types";

// --- Helpers ---
// Punto del gráfico: clave de eje (year/quarter/month) + claves dinámicas por serie.
type GroupChartPoint = Record<string, string | number>;
const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const formatCurrencyCompact = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
};

const formatCurrencyFull = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

/** Textos del selector de series y del estado vacío: cambian con lo que se evoluciona. */
export interface EvolutionCardTextos {
  /** Botón del selector cuando no hay ninguna serie elegida. */
  seleccionar: string;
  /** Botón del selector con n series elegidas. */
  seleccionados: (n: number) => string;
  /** Marcador del buscador del desplegable. */
  buscar: string;
  /** Mensaje del desplegable cuando la búsqueda no encuentra nada. */
  sinResultados: string;
  /** Encabezado de la lista del desplegable. */
  disponibles: string;
  /** Mensaje del gráfico cuando no hay ninguna serie elegida. */
  vacio: string;
}

export interface EvolutionCardProps {
  /** Tipo inicial. La tarjeta tiene su propio conmutador OV/FAC y se resincroniza si cambia. */
  recordType: RecordType;
  title: string;
  /** Descripción bajo el título. Recibe "anual", "trimestral" o "mensual" según la vista. */
  description: (periodo: string) => string;
  /** Texto del icono de ayuda. */
  help: string;
  /** Lectura de los datos: una fila por serie, en el formato del gráfico de grupos. */
  fetcher: (recordType: RecordType) => Promise<GroupingAnalysisResult>;
  seleccionInicial: SeleccionInicial;
  textos: EvolutionCardTextos;
  /**
   * Cuando cambia, la tarjeta vuelve a pedir los datos aunque el tipo sea el mismo. Lo
   * usa la de macro-categorías para refrescarse al guardar la clasificación.
   */
  refreshKey?: number;
}

type ViewMode = "ANNUAL" | "QUARTERLY" | "MONTHLY";

// Primer año con datos completos, igual que el resto de la app (ver getYearRange
// en @/lib/constants). 2020 es parcial y distorsiona la comparación.
const FIRST_YEAR = 2021;

/** Esqueleto de la tarjeta. Exportado para las envolturas que esperan algo antes de montarla. */
export function EvolutionCardSkeleton() {
  return (
    <Card className="border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden min-h-[500px]">
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

export function EvolutionCard({
  recordType: initialRecordType,
  title,
  description,
  help,
  fetcher,
  seleccionInicial,
  textos,
  refreshKey,
}: EvolutionCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GroupingAnalysisResult | null>(null);
  const [recordType, setRecordType] = useState<RecordType>(initialRecordType);
  const [viewMode, setViewMode] = useState<ViewMode>("ANNUAL");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // El tipo de fuera manda cuando cambia; dentro, el conmutador de la tarjeta es libre.
  useEffect(() => {
    setRecordType(initialRecordType);
  }, [initialRecordType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const raw = await fetcher(recordType);
      // Se filtra aquí (punto único) para que gráfico, selector de año y totales
      // usen el mismo rango sin tener que repetir el filtro en cada consumidor.
      const result = { ...raw, years: raw.years.filter((y) => y >= FIRST_YEAR) };
      setData(result);
      // Solo se elige por el usuario cuando no hay nada elegido: una recarga no debe
      // pisar su selección.
      if (selectedGroupIds.length === 0 && result.rows.length > 0) {
        setSelectedGroupIds(seleccionInicialIds(result.rows, seleccionInicial));
      }
      // Las vistas trimestral y mensual abren en el último año.
      if (!selectedYear && result.years.length > 0) {
        setSelectedYear(result.years[result.years.length - 1]);
      }
    } catch (err) {
      console.error("Error fetching evolution data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [recordType, refreshKey]);

  // Los datos llegan por serie; recharts los quiere por punto del eje.
  const chartData = useMemo(() => {
    if (!data || data.years.length === 0) return [];

    if (viewMode === "ANNUAL") {
      return data.years.map(year => {
        const entry: GroupChartPoint = { year };
        data.rows.forEach(row => {
          if (selectedGroupIds.includes(row.groupId)) {
            entry[row.groupName] = row.years[year]?.amount || 0;
            entry[`${row.groupName}_percent`] = row.years[year]?.percentage || 0;
            entry[`${row.groupName}_color`] = row.color;
          }
        });
        return entry;
      });
    } else if (viewMode === "QUARTERLY") {
      if (!selectedYear) return [];

      const quarterlyEntries = QUARTERS.map((name, idx) => {
        const startMonth = idx * 3 + 1;
        const entry: GroupChartPoint = { quarter: name };

        let grandQuarterlyTotal = 0;
        data.rows.forEach(r => {
          for (let m = startMonth; m < startMonth + 3; m++) {
            grandQuarterlyTotal += r.months?.[selectedYear]?.[m] || 0;
          }
        });

        data.rows.forEach(row => {
          if (selectedGroupIds.includes(row.groupId)) {
            let amount = 0;
            for (let m = startMonth; m < startMonth + 3; m++) {
              amount += row.months?.[selectedYear]?.[m] || 0;
            }
            entry[row.groupName] = amount;
            entry[`${row.groupName}_percent`] = grandQuarterlyTotal > 0 ? (amount / grandQuarterlyTotal) * 100 : 0;
            entry[`${row.groupName}_color`] = row.color;
          }
        });
        return entry;
      });
      return quarterlyEntries;
    } else {
      // Vista mensual del año elegido.
      if (!selectedYear) return [];

      const monthlyEntries = MONTHS.map((name, idx) => {
        const monthNum = idx + 1;
        const entry: GroupChartPoint = { month: name };

        data.rows.forEach(row => {
          if (selectedGroupIds.includes(row.groupId)) {
            const amount = row.months?.[selectedYear]?.[monthNum] || 0;
            entry[row.groupName] = amount;
            // El porcentaje es sobre el total del mes de todas las series, elegidas o no.
            const grandMonthlyTotal = data.rows.reduce((sum, r) => sum + (r.months?.[selectedYear]?.[monthNum] || 0), 0);
            entry[`${row.groupName}_percent`] = grandMonthlyTotal > 0 ? (amount / grandMonthlyTotal) * 100 : 0;
            entry[`${row.groupName}_color`] = row.color;
          }
        });
        return entry;
      });
      return monthlyEntries;
    }
  }, [data, selectedGroupIds, viewMode, selectedYear]);

  const selectedGroupDetails = useMemo(() => {
    return data?.rows.filter(r => selectedGroupIds.includes(r.groupId)) || [];
  }, [data, selectedGroupIds]);

  const periodo = viewMode === "MONTHLY" ? "mensual" : viewMode === "QUARTERLY" ? "trimestral" : "anual";

  // --- Custom Tooltip ---
  const CustomTooltip = ({ active, payload, label }: ChartTooltipProps<GroupChartPoint>) => {
    if (active && payload && payload.length) {
      // De mayor a menor importe.
      const sortedPayload = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

      return (
        <div className="bg-background/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[260px]">
          <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
            <History className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground text-lg">
              {(viewMode === "MONTHLY" || viewMode === "QUARTERLY") ? `${label} ${selectedYear}` : label}
            </span>
          </div>
          <div className="space-y-2">
            {sortedPayload.map((entry: ChartTooltipEntry<GroupChartPoint>, index: number) => {
              const color = String(entry.payload?.[`${entry.name}_color`] ?? "");
              const percent = Number(entry.payload?.[`${entry.name}_percent`] ?? 0);
              return (
                <div key={index} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-muted-foreground truncate">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono font-bold text-foreground">
                      {formatCurrencyFull(entry.value ?? 0)}
                    </span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 bg-primary/5 text-primary border-primary/20">
                      {percent.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading && !data) {
    return <EvolutionCardSkeleton />;
  }

  return (
    <Card className="border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden transition-all duration-500">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/5 pb-8 space-y-4 md:space-y-0 relative z-20">
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            {title}
            <InfoTooltip text={help} />
          </CardTitle>
          <CardDescription className="text-base">
            {description(periodo)}
          </CardDescription>
        </div>

        {/* Panel de controles */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Vista: anual, trimestral o mensual */}
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

          <div className="w-px h-8 bg-white/5 hidden sm:block" />

          {/* Conmutador OV/FAC */}
          <RecordTypeToggle
            value={recordType as RecordTypeValue}
            onValueChange={setRecordType}
          />

          <div className="w-px h-8 bg-white/5 hidden sm:block" />

          {/* Selector de series */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger render={
              <Button variant="outline" className="bg-background/40 border-white/10 hover:bg-background/60 h-10 gap-2 font-medium min-w-[250px] justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Layers className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{selectedGroupIds.length === 0 ? textos.seleccionar : textos.seleccionados(selectedGroupIds.length)}</span>
                </div>
                <Plus className="h-3 w-3 opacity-50 shrink-0" />
              </Button>
            } />
            <PopoverContent className="w-[300px] p-0 bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl" align="end">
              <Command label={textos.buscar}>
                <CommandInput placeholder={textos.buscar} className="h-11" />
                <CommandList>
                  <CommandEmpty>{textos.sinResultados}</CommandEmpty>
                  <CommandGroup heading={textos.disponibles}>
                    {data?.rows.map((row) => {
                      const isSelected = selectedGroupIds.includes(row.groupId);
                      return (
                        <CommandItem
                          key={row.groupId}
                          onSelect={() => {
                            setSelectedGroupIds(prev => isSelected ? prev.filter(id => id !== row.groupId) : [...prev, row.groupId]);
                          }}
                          className="flex items-center gap-2 py-3"
                        >
                          <div className={cn("flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all", isSelected ? "bg-primary text-primary-foreground" : "opacity-50")}>
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                          <span className="flex-1 font-medium">{row.groupName}</span>
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

        {/* Selector de año: solo en las vistas mensual y trimestral */}
        <AnimatePresence>
          {(viewMode === "MONTHLY" || viewMode === "QUARTERLY") && (
            <motion.div
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="flex flex-wrap gap-2 mb-6 p-1 bg-muted/20 border border-white/5 rounded-2xl w-fit"
            >
              {data?.years.map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={cn(
                    "px-5 py-2 text-xs font-bold rounded-xl transition-all",
                    selectedYear === year
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  {year}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          {/* Etiquetas de las series elegidas */}
          <AnimatePresence>
            {selectedGroupIds.length > 0 && (
              <motion.div className="flex flex-wrap gap-2 mb-8">
                {selectedGroupDetails.map(group => (
                  <Badge
                    key={group.groupId}
                    className="bg-white/5 border-white/10 text-foreground py-1 px-3 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                    {group.groupName}
                    <button type="button" aria-label={`Quitar ${group.groupName}`} onClick={() => setSelectedGroupIds(prev => prev.filter(id => id !== group.groupId))}>
                      <X className="h-3 w-3 ml-1" />
                    </button>
                  </Badge>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Gráfico */}
          <div className="h-[450px] w-full relative">
            {selectedGroupIds.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-6">
                <h4 className="text-xl font-bold">Visualiza tu Crecimiento</h4>
                <p className="text-muted-foreground text-sm max-w-sm">
                  {textos.vacio}
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey={viewMode === "ANNUAL" ? "year" : viewMode === "QUARTERLY" ? "quarter" : "month"}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 700 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 500 }}
                    tickFormatter={formatCurrencyCompact}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(147, 197, 253, 0.15)" }} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingBottom: 30, fontWeight: 600, textTransform: 'uppercase' }}
                  />
                  {selectedGroupDetails.map((group, idx) => (
                    <Bar
                      key={group.groupId}
                      dataKey={group.groupName}
                      stackId="a"
                      fill={group.color || "#8884d8"}
                      radius={idx === selectedGroupDetails.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={viewMode === "MONTHLY" ? 40 : 60}
                      animationDuration={1500}
                    >
                      {idx === selectedGroupDetails.length - 1 && (
                        <LabelList
                          dataKey={(entry) => selectedGroupDetails.reduce((sum, g) => sum + (entry[g.groupName] || 0), 0)}
                          position="top"
                          offset={10}
                          formatter={formatCurrencyCompact}
                          style={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }}
                        />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
