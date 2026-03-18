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
import { Check, ChevronsUpDown, X, LayoutTemplate, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// --- Types ---
type RecordType = "SALES_ORDER" | "INVOICE";

interface CategoryInfo {
  id: string;
  name: string;
  color: string;
}

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
  const [allCategories, setAllCategories] = useState<CategoryInfo[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [salesData, setSalesData] = useState<Record<string, any>[]>([]);
  const [openPopover, setOpenPopover] = useState(false);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

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
          .select("category_id, record_year, amount_usd")
          .eq("record_type", recordType);

        if (error) {
          console.error("Error fetching sales data:", error);
          return;
        }

        const records = data || [];
        
        // Discover available years
        const yearsSet = new Set<number>();
        records.forEach((r: any) => yearsSet.add(Number(r.record_year)));
        const years = Array.from(yearsSet).sort((a, b) => a - b);
        setAvailableYears(years);

        // Group by year and category_id, summing amounts
        const grouped: Record<number, Record<string, number>> = {};
        years.forEach(y => { grouped[y] = {}; });

        records.forEach((r: any) => {
          const year = Number(r.record_year);
          const catId = String(r.category_id);
          const amount = Number(r.amount_usd) || 0;
          
          if (!grouped[year]) grouped[year] = {};
          grouped[year][catId] = (grouped[year][catId] || 0) + amount;
        });

        // Build chart-ready data: [{year: "2021", catId1: total1, catId2: total2, ...}, ...]
        const chartData = years.map(year => {
          const dataPoint: Record<string, any> = { year: String(year) };
          Object.entries(grouped[year]).forEach(([catId, total]) => {
            dataPoint[catId] = Math.round(total * 100) / 100;
          });
          return dataPoint;
        });

        setSalesData(chartData);



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
        <div className="bg-sky-50/90 dark:bg-sky-950/80 backdrop-blur-xl border border-sky-200/40 dark:border-sky-400/20 p-4 rounded-xl shadow-2xl ring-1 ring-sky-300/10 min-w-[240px]">
          <h3 className="text-lg font-bold mb-3 text-foreground/90 border-b border-white/10 pb-2">{label}</h3>
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
                    <span className="text-muted-foreground truncate max-w-[140px]">
                      {category?.name || entry.name}
                    </span>
                  </div>
                  <span className="font-mono font-medium text-foreground">
                    {formatCurrency(entry.value)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 flex justify-between items-center font-bold">
            <span className="text-sm text-foreground/80">Total</span>
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
            Selecciona al menos una categoría del menú desplegable para empezar a visualizar la evolución histórica de las ventas.
          </p>
        </motion.div>
      );
    }

    return (
      <motion.div
        key={recordType} // re-animate when type changes
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="h-[400px] w-full mt-8"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={salesData}
            margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
            barSize={40}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground) / 0.1)" />
            <XAxis
              dataKey="year"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }}
              dy={10}
              label={{ value: 'Año', position: 'insideBottomRight', offset: -5, style: { fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 600 } }}
            />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              dx={-10}
              label={{ value: 'Monto (USD)', angle: -90, position: 'insideLeft', offset: -20, style: { fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 600, textAnchor: 'middle' } }}
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Histórico por Categoría
            </CardTitle>
            <CardDescription className="text-base">
              Evolución de ventas anuales segmentadas ({availableYears.length > 0 ? `${availableYears[0]}–${availableYears[availableYears.length - 1]}` : "..."}).
            </CardDescription>
          </div>

          {/* Control Panel */}
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full sm:w-auto">

            {/* Record Type Toggle */}
            <Tabs
              value={recordType}
              onValueChange={(v) => setRecordType(v as RecordType)}
              className="w-full sm:w-auto"
            >
              <TabsList className="grid w-full grid-cols-2 bg-black/20 p-1 border border-white/5 rounded-xl">
                <TabsTrigger
                  value="SALES_ORDER"
                  className={cn(
                    "rounded-lg transition-all duration-300 font-medium data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-sm",
                  )}
                >
                  Órdenes (OV)
                </TabsTrigger>
                <TabsTrigger
                  value="INVOICE"
                  className={cn(
                    "rounded-lg transition-all duration-300 font-medium data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm",
                  )}
                >
                  Facturas (FAC)
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Category Multi-select */}
            <Popover open={openPopover} onOpenChange={setOpenPopover}>
              <PopoverTrigger
                className="inline-flex items-center justify-between w-full sm:w-[250px] px-3 py-2 text-sm bg-black/20 border border-white/10 hover:bg-black/40 transition-all shadow-sm rounded-xl text-foreground cursor-pointer"
              >
                <span className="truncate flex-1 text-left">
                  {selectedCategoryIds.length === 0
                    ? "Seleccionar Categorías..."
                    : `${selectedCategoryIds.length} seleccionadas`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0 bg-background/95 backdrop-blur-xl border-white/10 rounded-xl" align="end">
                <Command className="bg-transparent">
                  <CommandInput placeholder="Buscar categoría..." className="border-none focus:ring-0" />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>No se encontraron categorías.</CommandEmpty>
                    <CommandGroup>
                      {allCategories.map((category) => {
                        const isSelected = selectedCategoryIds.includes(category.id);
                        return (
                          <CommandItem
                            key={category.id}
                            value={category.name}
                            onSelect={() => handleToggleCategory(category.id)}
                            className="cursor-pointer"
                          >
                            <div className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border transition-all",
                              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-white/20 opacity-50 [&_svg]:invisible"
                            )}>
                              <Check className="h-3 w-3" />
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
                              <span>{category.name}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

          </div>
        </div>

        {/* Floating Badges */}
        <AnimatePresence>
          {selectedCategories.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap items-center gap-2 pt-4"
            >
              {selectedCategories.map(cat => (
                <Badge
                  key={cat.id}
                  variant="secondary"
                  className="bg-white/5 hover:bg-white/10 text-foreground/80 border-white/10 transition-colors pr-1.5 py-1"
                >
                  <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                  <button
                    onClick={() => handleToggleCategory(cat.id)}
                    className="ml-2 bg-white/10 hover:bg-destructive/80 hover:text-white rounded-full p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearCategories}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
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
