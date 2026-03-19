"use client";

import React, { useState, useMemo, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, ChevronsUpDown, X, LayoutTemplate, Activity, FileText, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// --- Types ---
type RecordType = "SALES_ORDER" | "INVOICE";
type ViewMode = "ANNUAL" | "MONTHLY";

interface CategoryInfo {
  id: string;
  name: string;
  color: string;
}

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", 
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

// Fallback color if a category has no color set
const DEFAULT_COLOR = "#6366f1";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

export function HistoricalSalesCategory() {
  const [isLoading, setIsLoading] = useState(true);
  const [recordType, setRecordType] = useState<RecordType>("SALES_ORDER");
  const [viewMode, setViewMode] = useState<ViewMode>("ANNUAL");
  const [allCategories, setAllCategories] = useState<CategoryInfo[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [annualData, setAnnualData] = useState<Record<string, any>[]>([]);
  const [monthlyData, setMonthlyData] = useState<Record<number, Record<string, any>[]>>({});
  const [openPopover, setOpenPopover] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const supabase = createClient();

  // Fetch categories once on mount
  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, color")
        .order("name");
      
      if (error) {
        console.error("Error fetching categories:", error);
        return;
      }

      const cats: CategoryInfo[] = (data || []).map((cat: any) => ({
        id: String(cat.id),
        name: String(cat.name),
        color: cat.color || DEFAULT_COLOR,
      }));

      setAllCategories(cats);
    };

    fetchCategories();
  }, []);

  // Fetch sales data when record type changes
  useEffect(() => {
    const fetchSalesData = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("sales_records")
          .select("category_id, record_year, record_month, amount_usd")
          .eq("record_type", recordType);

        if (error) {
          console.error("Error fetching sales data:", error);
          return;
        }

        const records = data || [];
        
        // --- 1. Available Years ---
        const yearsSet = new Set<number>();
        records.forEach((r: any) => yearsSet.add(Number(r.record_year)));
        const years = Array.from(yearsSet).sort((a, b) => a - b);
        setAvailableYears(years);
        if (!selectedYear && years.length > 0) {
          setSelectedYear(years[years.length - 1]); // Default to latest
        }

        // --- 2. Annual Aggregation ---
        const annualGrouped: Record<number, Record<string, number>> = {};
        years.forEach(y => { annualGrouped[y] = {}; });

        records.forEach((r: any) => {
          const year = Number(r.record_year);
          const catId = String(r.category_id);
          const amount = Number(r.amount_usd) || 0;
          annualGrouped[year][catId] = (annualGrouped[year][catId] || 0) + amount;
        });

        const annChartData = years.map(year => {
          const dataPoint: Record<string, any> = { year: String(year) };
          Object.entries(annualGrouped[year]).forEach(([catId, total]) => {
            dataPoint[catId] = Math.round(total * 100) / 100;
          });
          return dataPoint;
        });
        setAnnualData(annChartData);

        // --- 3. Monthly Aggregation for each year ---
        const monthlyRecords: Record<number, Record<string, any>[]> = {};
        years.forEach(year => {
          // Initialize 12 months
          const yearMonths = MONTHS.map((m, idx) => ({ month: m, monthIdx: idx + 1 }));
          const yearGrouped: Record<number, Record<string, number>> = {};
          for (let i = 1; i <= 12; i++) yearGrouped[i] = {};

          records.filter((r: any) => Number(r.record_year) === year).forEach((r: any) => {
            const month = Number(r.record_month);
            const catId = String(r.category_id);
            const amount = Number(r.amount_usd) || 0;
            yearGrouped[month][catId] = (yearGrouped[month][catId] || 0) + amount;
          });

          monthlyRecords[year] = yearMonths.map(m => {
            const dataPoint: Record<string, any> = { month: m.month };
            Object.entries(yearGrouped[m.monthIdx]).forEach(([catId, total]) => {
              dataPoint[catId] = Math.round(total * 100) / 100;
            });
            return dataPoint;
          });
        });
        setMonthlyData(monthlyRecords);

      } catch (err) {
        console.error("Critical error fetching sales data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (allCategories.length > 0) {
      fetchSalesData();
    }
  }, [recordType, allCategories]);

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

  // --- Custom Tooltip ---
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const sortedPayload = [...payload].sort((a: any, b: any) => b.value - a.value);
      const total = sortedPayload.reduce((sum: number, entry: any) => sum + entry.value, 0);

      return (
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-black/5 dark:border-white/5 p-4 rounded-xl shadow-2xl min-w-[240px]">
          <h3 className="text-lg font-bold mb-3 text-slate-800 dark:text-slate-200 border-b border-black/5 dark:border-white/5 pb-2">
            {viewMode === "MONTHLY" ? `${label} ${selectedYear}` : label}
          </h3>
          <div className="space-y-2">
            {sortedPayload.map((entry: any, index: number) => {
              const category = catMap.get(entry.dataKey);
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
                    {formatCurrency(entry.value)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-black/5 dark:border-white/5 flex justify-between items-center font-bold">
            <span className="text-sm text-slate-400">Total</span>
            <span className="font-mono text-primary">{formatCurrency(total)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Selected category objects in order
  const selectedCategories = useMemo(() => {
    return selectedCategoryIds
      .map(id => catMap.get(id))
      .filter(Boolean) as CategoryInfo[];
  }, [selectedCategoryIds, catMap]);

  const currentChartData = useMemo(() => {
    if (viewMode === "ANNUAL") return annualData;
    return selectedYear ? monthlyData[selectedYear] || [] : [];
  }, [viewMode, annualData, monthlyData, selectedYear]);

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
        key={`${recordType}-${viewMode}-${selectedYear}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-[400px] w-full mt-8"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={currentChartData}
            margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
            barSize={viewMode === "MONTHLY" ? 30 : 45}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.1)" />
            <XAxis
              dataKey={viewMode === "ANNUAL" ? "year" : "month"}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }}
              dy={10}
            />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              dx={-10}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(147, 197, 253, 0.15)' }} />

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
      </motion.div>
    );
  };

  return (
    <Card className="col-span-1 border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <CardHeader className="border-b border-white/5 pb-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Histórico {viewMode === "MONTHLY" ? "Mensual" : "por Categoría"}
            </CardTitle>
            <CardDescription className="text-base">
              {viewMode === "MONTHLY" 
                ? `Evolución mensual del año ${selectedYear} para categorías seleccionadas.`
                : `Evolución de ventas anuales segmentadas (${availableYears[0]}–${availableYears[availableYears.length - 1]}).`}
            </CardDescription>
          </div>

          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full lg:w-auto">
            
            {/* View Mode Switcher */}
            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as ViewMode)}
              className="w-full sm:w-auto"
            >
              <TabsList className="grid w-full grid-cols-2 bg-black/20 p-1 border border-white/5 rounded-xl h-10">
                <TabsTrigger value="ANNUAL" className="text-xs font-bold uppercase tracking-wider">Anual</TabsTrigger>
                <TabsTrigger value="MONTHLY" className="text-xs font-bold uppercase tracking-wider">Mensual</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="w-px h-6 bg-white/10 hidden sm:block" />

            {/* Record Type Toggle */}
            <Tabs
              value={recordType}
              onValueChange={(v) => setRecordType(v as RecordType)}
              className="w-full sm:w-auto"
            >
              <TabsList className="grid w-full grid-cols-2 bg-black/20 p-1 border border-white/5 rounded-xl h-10">
                <TabsTrigger 
                value="SALES_ORDER" 
                className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
              >
                <FileText className="h-3.5 w-3.5" /> ÓRDENES (OV)
              </TabsTrigger>
              <TabsTrigger 
                value="INVOICE" 
                className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-[state=active]:bg-emerald-500 data-[state=active]:text-white transition-all"
              >
                <Receipt className="h-3.5 w-3.5" /> FACTURAS (FAC)
              </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Category selection */}
            <Popover open={openPopover} onOpenChange={setOpenPopover}>
              <PopoverTrigger className="inline-flex items-center justify-between w-full sm:w-[250px] px-3 py-2 text-sm bg-black/20 border border-white/10 hover:bg-black/40 transition-all shadow-sm rounded-xl text-foreground cursor-pointer h-10">
                  <span className="truncate flex-1 text-left">
                    {selectedCategoryIds.length === 0 ? "Seleccionar Categorías..." : `${selectedCategoryIds.length} seleccionadas`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0 bg-background/95 backdrop-blur-xl border-white/10 rounded-xl" align="end">
                <Command>
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
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* YEAR SELECTION - BUTTON BOX (Only in Monthly View) */}
        <AnimatePresence>
          {viewMode === "MONTHLY" && (
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
                    selectedYear === year 
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
                  <button onClick={() => handleToggleCategory(cat.id)} className="ml-2 hover:text-destructive">
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
