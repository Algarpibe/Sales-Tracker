"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  BarChart3, 
  FileText, 
  Receipt, 
  Plus, 
  X, 
  Check, 
  History, 
  Layers,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGroupingAnalysisData } from "@/actions/grouping-actions";
import { calculateSeasonalityFactors, getSeasonalForecast, calculateRunRate } from "@/lib/math-utils";
import type { CategoryGroup, GroupingAnalysisResult, RecordType } from "@/types/database";

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", 
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

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

interface GroupForecastCardProps {
  savedGroups: CategoryGroup[];
  recordType: RecordType;
  baseYear?: number;
}

export function GroupForecastCard({ savedGroups, recordType: initialRecordType, baseYear = new Date().getFullYear() }: GroupForecastCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GroupingAnalysisResult | null>(null);
  const [recordType, setRecordType] = useState<RecordType>(initialRecordType);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    setRecordType(initialRecordType);
  }, [initialRecordType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getGroupingAnalysisData(recordType);
      setData(result);
      if (selectedGroupIds.length === 0 && result.rows.length > 0) {
        setSelectedGroupIds(result.rows.slice(0, 3).map(r => r.groupId));
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

  const chartData = useMemo(() => {
    if (!data) return [];
    
    const now = new Date();
    // Use the baseYear, if baseYear is not current year, we will just project based on elapsed months of that year if it was in the past?
    // Let's assume baseYear forecast is similar to page.tsx logic
    const currentYear = baseYear; 
    const historicalYears = [2025, 2024, 2023]; 
    const isCurrentActualYear = currentYear === now.getFullYear();
    const currentMonthIdx = now.getMonth();
    const lastElapsedMonth = isCurrentActualYear ? currentMonthIdx + 1 : 12;

    const monthlyEntries = MONTHS.map((name, idx) => {
      const entry: any = { month: name };
      const monthNum = idx + 1;
      let totalForecastVal = 0;

      data.rows.forEach(row => {
        if (selectedGroupIds.includes(row.groupId)) {
          const historicalMatrix = historicalYears.map(y => {
              return MONTHS.map((_, mIdx) => row.months?.[y]?.[mIdx + 1] || 0);
          });
          const seasonalityFactors = calculateSeasonalityFactors(historicalMatrix);

          const currentYearRawData = MONTHS.map((_, mIdx) => row.months?.[currentYear]?.[mIdx + 1] || 0);
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
            const realVal = row.months?.[currentYear]?.[monthNum] || 0;
            entry[row.groupName] = realVal;
          } else {
            entry[row.groupName] = 0;
          }
          
          entry[`${row.groupName}_color`] = row.color;
          // Percentage of the forecast for the tooltip
          entry[`${row.groupName}_forecast`] = val;
        }
      });

      entry.total_forecast = totalForecastVal;
      
      // Calculate percentages based on the forecast for tooltip comparison
      data.rows.forEach(row => {
          if (selectedGroupIds.includes(row.groupId)) {
              const val = entry[`${row.groupName}_forecast`] || 0;
              entry[`${row.groupName}_percent`] = totalForecastVal > 0 ? (val / totalForecastVal) * 100 : 0;
          }
      });
      
      return entry;
    });

    return monthlyEntries;
  }, [data, selectedGroupIds, baseYear]);

  const selectedGroupDetails = useMemo(() => {
    return data?.rows.filter(r => selectedGroupIds.includes(r.groupId)) || [];
  }, [data, selectedGroupIds]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
      
      return (
        <div className="bg-background/95 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl min-w-[260px]">
          <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground text-lg">
              {label} {baseYear}
            </span>
          </div>
          <div className="mb-3 flex justify-between items-center text-xs">
            <span className="text-muted-foreground font-bold">Total Forecast:</span>
            <span className="text-primary font-mono font-bold text-sm">{formatCurrencyFull(payload[0].payload.total_forecast)}</span>
          </div>
          <div className="space-y-2">
            {sortedPayload
              .filter((entry: any) => entry.dataKey !== "total_forecast")
              .map((entry: any, index: number) => {
                const groupName = entry.name;
                const color = entry.payload[`${groupName}_color`];
                const percent = entry.payload[`${groupName}_percent`];
                const forecastVal = entry.payload[`${groupName}_forecast`] || 0;
                
                return (
                  <div key={index} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-medium text-muted-foreground truncate">{groupName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-mono font-bold text-foreground">
                        {formatCurrencyFull(forecastVal)}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 bg-primary/5 text-primary border-primary/20">
                        {(percent || 0).toFixed(1)}%
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
    <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-500 relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent pointer-events-none" />
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-white/5 pb-8 space-y-4 md:space-y-0 relative z-20">
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <TrendingUp className="h-6 w-6 text-indigo-400" />
            </div>
            Forecast Estacional por Grupo
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Proyección mensual de las agrupaciones estratégicas (Año {baseYear}).
          </CardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          
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
        <div className="relative z-10 w-full">
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

          <div className="h-[450px] w-full relative">
            {selectedGroupIds.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-6">
                <h4 className="text-xl font-bold">Visualiza el Forecast</h4>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Selecciona al menos un grupo de análisis para ver la proyección mensual.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
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
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(147, 197, 253, 0.15)" }} />
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
                    stroke="#22d3ee" 
                    strokeWidth={3}
                    strokeDasharray="8 5"
                    dot={false}
                    activeDot={{ r: 6, fill: "#22d3ee", strokeWidth: 0 }}
                    filter="url(#glow)"
                    animationDuration={2000}
                  />
                  {selectedGroupDetails.map((group, idx) => (
                    <Bar 
                      key={group.groupId}
                      dataKey={group.groupName}
                      stackId="a"
                      fill={group.color || "#8884d8"}
                      radius={idx === selectedGroupDetails.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={60}
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
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
