"use client";

import React, { useState, useMemo, useEffect } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileText, 
  Receipt, 
  Plus, 
  X, 
  Check, 
  PencilRuler,
  TrendingUp,
  ChevronsUpDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { calculateSeasonalityFactors, getSeasonalForecast, calculateRunRate } from "@/lib/math-utils";

type RecordType = "SALES_ORDER" | "INVOICE";

interface CategoryInfo {
  id: string;
  name: string;
  color: string;
}

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", 
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const DEFAULT_COLOR = "#6366f1";

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

interface ForecastSalesCategoryProps {
  baseYear?: number;
}

export function ForecastSalesCategory({ baseYear = new Date().getFullYear() }: ForecastSalesCategoryProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [recordType, setRecordType] = useState<RecordType>("SALES_ORDER");
  const [allCategories, setAllCategories] = useState<CategoryInfo[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [categoryMonthSums, setCategoryMonthSums] = useState<Record<string, Record<number, Record<number, number>>>>({});

  const supabase = createClient();

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, color")
        .order("name");
      
      if (!error && data) {
        setAllCategories(data.map((cat: any) => ({
          id: String(cat.id),
          name: String(cat.name),
          color: cat.color || DEFAULT_COLOR,
        })));
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("sales_records")
          .select("category_id, record_year, record_month, amount_usd")
          .eq("record_type", recordType);

        if (error) throw error;

        const records = data || [];
        const newSums: Record<string, Record<number, Record<number, number>>> = {};

        records.forEach((r: any) => {
          const year = Number(r.record_year);
          const month = Number(r.record_month);
          const catId = String(r.category_id);
          const amount = Number(r.amount_usd) || 0;

          if (!newSums[catId]) newSums[catId] = {};
          if (!newSums[catId][year]) newSums[catId][year] = {};
          newSums[catId][year][month] = (newSums[catId][year][month] || 0) + amount;
        });

        setCategoryMonthSums(newSums);
      } catch (err) {
        console.error("Error fetching sales data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (allCategories.length > 0) {
      fetchSalesData();
    }
  }, [recordType, allCategories]);

  const catMap = useMemo(() => {
    const map = new Map<string, CategoryInfo>();
    allCategories.forEach(c => map.set(c.id, c));
    return map;
  }, [allCategories]);

  const chartData = useMemo(() => {
    if (Object.keys(categoryMonthSums).length === 0) return [];
    
    const now = new Date();
    const currentYear = baseYear; 
    const historicalYears = [2025, 2024, 2023]; 
    const isCurrentActualYear = currentYear === now.getFullYear();
    const currentMonthIdx = now.getMonth();
    const lastElapsedMonth = isCurrentActualYear ? currentMonthIdx + 1 : 12;

    const monthlyEntries = MONTHS.map((name, idx) => {
      const entry: any = { month: name };
      const monthNum = idx + 1;
      let totalForecastVal = 0;

      selectedCategoryIds.forEach(catId => {
        const catMonths = categoryMonthSums[catId] || {};
        const cat = catMap.get(catId);
        if (!cat) return;

        const historicalMatrix = historicalYears.map(y => {
            return MONTHS.map((_, mIdx) => catMonths[y]?.[mIdx + 1] || 0);
        });
        const seasonalityFactors = calculateSeasonalityFactors(historicalMatrix);

        const currentYearRawData = MONTHS.map((_, mIdx) => catMonths[currentYear]?.[mIdx + 1] || 0);
        const currentYearElapsedData = currentYearRawData.slice(0, lastElapsedMonth);

        if (isCurrentActualYear && currentYearElapsedData.length > currentMonthIdx) {
          const currentMonthReal = currentYearElapsedData[currentMonthIdx] || 0;
          const currentDay = now.getDate();
          const totalDays = new Date(now.getFullYear(), currentMonthIdx + 1, 0).getDate();
          currentYearElapsedData[currentMonthIdx] = calculateRunRate(currentMonthReal, currentDay, totalDays);
        }

        const projectedForecast = getSeasonalForecast(currentYearElapsedData, seasonalityFactors);
        const val = Math.round(projectedForecast[idx] * 100) / 100 || 0;
        
        // Total forecast line data
        totalForecastVal += val;

        // Bars data: Only real data for elapsed months
        if (monthNum <= lastElapsedMonth) {
          const realVal = catMonths[currentYear]?.[monthNum] || 0;
          entry[catId] = realVal;
        } else {
          entry[catId] = 0;
        }
        
        entry[`${catId}_color`] = cat.color;
        entry[`${catId}_forecast`] = val;
      });

      entry.total_forecast = totalForecastVal;

      selectedCategoryIds.forEach(catId => {
          const val = entry[`${catId}_forecast`] || 0;
          entry[`${catId}_percent`] = totalForecastVal > 0 ? (val / totalForecastVal) * 100 : 0;
      });
      
      return entry;
    });

    return monthlyEntries;
  }, [categoryMonthSums, selectedCategoryIds, baseYear, catMap]);

  const selectedCategories = useMemo(() => {
    return selectedCategoryIds.map(id => catMap.get(id)).filter(Boolean) as CategoryInfo[];
  }, [selectedCategoryIds, catMap]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
      
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
            <span className="text-emerald-500 font-mono font-bold text-sm">{formatCurrencyFull(payload[0].payload.total_forecast)}</span>
          </div>
          <div className="space-y-4">
            {selectedCategoryIds.map((catId, index) => {
                const cat = catMap.get(catId);
                if (!cat) return null;
                const percent = payload[0].payload[`${cat.id}_percent`];
                const forecastVal = payload[0].payload[`${cat.id}_forecast`] || 0;
                const realSalesVal = payload[0].payload[cat.id] || 0;

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
                        {formatCurrencyFull(realSalesVal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <div className="size-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Proyección:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-foreground">
                          {formatCurrencyFull(forecastVal)}
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
  };

  const handleToggleCategory = (catId: string) => {
    setSelectedCategoryIds(prev =>
      prev.includes(catId)
        ? prev.filter(id => id !== catId)
        : [...prev, catId]
    );
  };

  if (isLoading && selectedCategoryIds.length === 0) {
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
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Proyección mensual de categorías específicas (Año {baseYear}).
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          
          <Tabs 
            value={recordType} 
            onValueChange={(v) => setRecordType(v as RecordType)}
            className="w-full sm:w-auto"
          >
            <TabsList className="bg-muted/30 backdrop-blur-sm border border-white/5 h-10 p-1">
              <TabsTrigger 
                value="SALES_ORDER" 
                className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
              >
                <FileText className="h-3.5 w-3.5" /> ÓRDENES
              </TabsTrigger>
              <TabsTrigger 
                value="INVOICE" 
                className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-[state=active]:bg-emerald-500 data-[state=active]:text-white transition-all"
              >
                <Receipt className="h-3.5 w-3.5" /> FACTURAS
              </TabsTrigger>
            </TabsList>
          </Tabs>

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
              <Command>
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
                    <button onClick={() => handleToggleCategory(cat.id)}>
                      <X className="h-3 w-3 ml-1" />
                    </button>
                  </Badge>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-[450px] w-full relative">
            {selectedCategoryIds.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-6">
                <h4 className="text-xl font-bold">Visualiza el Forecast Detallado</h4>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Selecciona al menos una categoría para calcular su proyección anual con base histórica.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12, fontWeight: 700 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 500 }}
                    tickFormatter={formatCurrencyCompact}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(16, 185, 129, 0.1)" }} />
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
                          formatter={formatCurrencyCompact}
                          style={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 }}
                        />
                      )}
                    </Bar>
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
