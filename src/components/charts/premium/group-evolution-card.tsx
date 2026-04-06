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
  BarChart3, 
  FileText, 
  Receipt, 
  Plus, 
  X, 
  Check, 
  History, 
  Layers,
  Sparkles,
  MousePointer2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGroupingAnalysisData } from "@/actions/grouping-actions";
import type { CategoryGroup, GroupingAnalysisResult, RecordType } from "@/types/database";

// --- Helpers ---
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

interface GroupEvolutionCardProps {
  savedGroups: CategoryGroup[];
  recordType: RecordType;
}

type ViewMode = "ANNUAL" | "QUARTERLY" | "MONTHLY";

export function GroupEvolutionCard({ savedGroups, recordType: initialRecordType }: GroupEvolutionCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GroupingAnalysisResult | null>(null);
  const [recordType, setRecordType] = useState<RecordType>(initialRecordType);
  const [viewMode, setViewMode] = useState<ViewMode>("ANNUAL");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Sync with prop
  useEffect(() => {
    setRecordType(initialRecordType);
  }, [initialRecordType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getGroupingAnalysisData(recordType);
      setData(result);
      // Auto-select first 3 groups if none selected
      if (selectedGroupIds.length === 0 && result.rows.length > 0) {
        setSelectedGroupIds(result.rows.slice(0, 3).map(r => r.groupId));
      }
      // Set latest year as default for monthly
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
  }, [recordType]);

  // Transpose data for Recharts (Year based rows)
  const chartData = useMemo(() => {
    if (!data || data.years.length === 0) return [];
    
    if (viewMode === "ANNUAL") {
      return data.years.map(year => {
        const entry: any = { year };
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
        const entry: any = { quarter: name };
        
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
      // Monthly view for selectedYear
      if (!selectedYear) return [];
      
      const monthlyEntries = MONTHS.map((name, idx) => {
        const monthNum = idx + 1;
        const entry: any = { month: name };
        
        data.rows.forEach(row => {
          if (selectedGroupIds.includes(row.groupId)) {
            const amount = row.months?.[selectedYear]?.[monthNum] || 0;
            entry[row.groupName] = amount;
            // Percentage relative to monthly grand total
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

  // --- Custom Tooltip ---
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Sort items by value descending
      const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
      
      return (
        <div className="bg-background/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[260px]">
          <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
            <History className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground text-lg">
              {(viewMode === "MONTHLY" || viewMode === "QUARTERLY") ? `${label} ${selectedYear}` : label}
            </span>
          </div>
          <div className="space-y-2">
            {sortedPayload.map((entry: any, index: number) => {
              const color = entry.payload[`${entry.name}_color`];
              const percent = entry.payload[`${entry.name}_percent`];
              return (
                <div key={index} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-muted-foreground truncate">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono font-bold text-foreground">
                      {formatCurrencyFull(entry.value)}
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

  return (
    <Card className="border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden transition-all duration-500">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/5 pb-8 space-y-4 md:space-y-0 relative z-20">
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            Evolución Histórica por Grupo
          </CardTitle>
          <CardDescription className="text-base">
            Tendencia {viewMode === "MONTHLY" ? "mensual" : viewMode === "QUARTERLY" ? "trimestral" : "anual"} y desglose porcentual de tus agrupaciones estratégicas.
          </CardDescription>
        </div>

        {/* Control Panel */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Mode Switcher */}
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

          {/* Record Type Toggle */}
          <Tabs 
            value={recordType} 
            onValueChange={(v) => setRecordType(v as RecordType)}
            className="w-auto"
          >
            <TabsList className="bg-muted/30 backdrop-blur-sm border border-white/5 h-10 p-1">
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

          <div className="w-px h-8 bg-white/5 hidden sm:block" />

          {/* Group Multi-Select */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger render={
              <Button variant="outline" className="bg-background/40 border-white/10 hover:bg-background/60 h-10 gap-2 font-medium min-w-[250px] justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Layers className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{selectedGroupIds.length === 0 ? "Seleccionar Grupos..." : `${selectedGroupIds.length} Grupos Seleccionados`}</span>
                </div>
                <Plus className="h-3 w-3 opacity-50 shrink-0" />
              </Button>
            } />
            <PopoverContent className="w-[300px] p-0 bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl" align="end">
              <Command>
                <CommandInput placeholder="Buscar grupos..." className="h-11" />
                <CommandList>
                  <CommandEmpty>No se encontraron grupos.</CommandEmpty>
                  <CommandGroup heading="Grupos Disponibles">
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
        
        {/* YEAR SELECTION - Only in Monthly and Quarterly Mode */}
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
          {/* Selected Badges */}
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
                    <button onClick={() => setSelectedGroupIds(prev => prev.filter(id => id !== group.groupId))}>
                      <X className="h-3 w-3 ml-1" />
                    </button>
                  </Badge>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chart */}
          <div className="h-[450px] w-full relative">
            {selectedGroupIds.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-6">
                <h4 className="text-xl font-bold">Visualiza tu Crecimiento</h4>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Selecciona al menos un grupo de análisis en el panel superior.
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
