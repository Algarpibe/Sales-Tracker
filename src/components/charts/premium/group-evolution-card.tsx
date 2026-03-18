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

export function GroupEvolutionCard({ savedGroups, recordType: initialRecordType }: GroupEvolutionCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GroupingAnalysisResult | null>(null);
  const [recordType, setRecordType] = useState<RecordType>(initialRecordType);
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
  }, [data, selectedGroupIds]);

  const selectedGroupDetails = useMemo(() => {
    return data?.rows.filter(r => selectedGroupIds.includes(r.groupId)) || [];
  }, [data, selectedGroupIds]);

  // --- Custom Tooltip ---
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Sort items by value descending
      const sortedPayload = [...payload].sort((a, b) => b.value - a.value);
      
      return (
        <div className="bg-background/80 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl ring-1 ring-black/5 min-w-[260px]">
          <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
            <History className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground text-lg">{label}</span>
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
            Tendencia anual y desglose porcentual de tus agrupaciones estratégicas.
          </CardDescription>
        </div>

        {/* Floating Control Panel */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Record Type Toggle */}
          <Tabs 
            value={recordType} 
            onValueChange={(v) => setRecordType(v as RecordType)}
            className="w-auto"
          >
            <TabsList className="bg-muted/30 backdrop-blur-sm border border-white/5 h-10 p-1">
              <TabsTrigger 
                value="SALES_ORDER" 
                className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)] transition-all"
              >
                <FileText className="h-3.5 w-3.5" /> Órdenes
              </TabsTrigger>
              <TabsTrigger 
                value="INVOICE" 
                className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all"
              >
                <Receipt className="h-3.5 w-3.5" /> Facturas
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="w-px h-8 bg-white/5 hidden sm:block" />

          {/* Group Multi-Select */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger render={
              <Button 
                variant="outline" 
                className="bg-background/40 border-white/10 hover:bg-background/60 h-10 gap-2 font-medium"
              >
                <Layers className="h-4 w-4 text-primary" />
                {selectedGroupIds.length === 0 ? "Seleccionar Grupos..." : `${selectedGroupIds.length} Grupos Seleccionados`}
                <Plus className="h-3 w-3 ml-1 opacity-50" />
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
                            setSelectedGroupIds(prev => 
                              isSelected 
                                ? prev.filter(id => id !== row.groupId) 
                                : [...prev, row.groupId]
                            );
                          }}
                          className="flex items-center gap-2 py-3"
                        >
                          <div 
                            className={cn(
                              "flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all",
                              isSelected ? "bg-primary text-primary-foreground" : "opacity-50"
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                          <span className="flex-1 font-medium">{row.groupName}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
                {selectedGroupIds.length > 0 && (
                  <div className="p-2 border-t border-white/5">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => setSelectedGroupIds([])}
                    >
                      <X className="h-3 w-3 mr-2" /> Limpiar selección
                    </Button>
                  </div>
                )}
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        <div className="relative">
          {/* Selected Group Badges */}
          <AnimatePresence>
            {selectedGroupIds.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-wrap gap-2 mb-8"
              >
                {selectedGroupDetails.map(group => (
                  <Badge 
                    key={group.groupId}
                    className="bg-white/5 border-white/10 text-foreground py-1 px-3 flex items-center gap-2 hover:bg-white/10 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                    {group.groupName}
                    <button 
                      onClick={() => setSelectedGroupIds(prev => prev.filter(id => id !== group.groupId))}
                      className="ml-1 hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chart or Empty State */}
          <div className="h-[450px] w-full relative">
            {selectedGroupIds.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative">
                  <motion.div 
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                    className="w-24 h-24 rounded-full bg-primary/5 flex items-center justify-center"
                  >
                    <Sparkles className="h-10 w-10 text-primary/30" />
                  </motion.div>
                  <motion.div 
                    animate={{ x: [0, 5, 0], y: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-1 -right-1 bg-background p-1.5 rounded-lg border border-white/10 shadow-lg"
                  >
                    <MousePointer2 className="h-4 w-4 text-primary" />
                  </motion.div>
                </div>
                <div className="space-y-2 max-w-sm">
                  <h4 className="text-xl font-bold">Visualiza tu Crecimiento</h4>
                  <p className="text-muted-foreground text-sm">
                    Selecciona al menos un grupo de análisis en el panel superior para visualizar la evolución histórica y el desglose porcentual.
                  </p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="year" 
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
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <Legend 
                    verticalAlign="top" 
                    align="right" 
                    iconType="circle"
                    wrapperStyle={{ 
                      fontSize: 12, 
                      paddingBottom: 30, 
                      fontWeight: 600,
                      textTransform: 'uppercase', 
                      letterSpacing: '0.025em',
                      color: 'hsl(var(--foreground))'
                    }}
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
                          dataKey={(entry) => {
                            // Sum of all selected groups for this year
                            return selectedGroupDetails.reduce((sum, g) => sum + (entry[g.groupName] || 0), 0);
                          }}
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
