"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  PieChart as PieChartIcon, 
  Table as TableIcon, 
  Layers, 
  TrendingUp, 
  FileText, 
  Receipt,
  Plus,
  X,
  Check,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupingManager } from "./grouping-manager";
import { getGroupingAnalysisData } from "@/actions/grouping-actions";
import type { Category, GroupingAnalysisResult, RecordType } from "@/types/database";

// --- Helpers ---
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`;
};

interface GroupingAnalysisCardProps {
  categories: Category[];
  recordType: RecordType;
}

export function GroupingAnalysisCard({ categories, recordType: initialRecordType }: GroupingAnalysisCardProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GroupingAnalysisResult | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordType, setRecordType] = useState<RecordType>(initialRecordType);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);

  // Sync with prop if it changes from outside
  useEffect(() => {
    setRecordType(initialRecordType);
  }, [initialRecordType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getGroupingAnalysisData(recordType);
      setData(result);
      // Auto-select all by default if none selected yet
      if (selectedGroupIds.length === 0 && result.rows.length > 0) {
        setSelectedGroupIds(result.rows.map(r => r.groupId));
      }
    } catch (err) {
      console.error("Error fetching grouping analysis:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [recordType, refreshKey]);

  // Filtered rows for the table
  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (selectedGroupIds.length === 0) return data.rows;
    return data.rows.filter(row => selectedGroupIds.includes(row.groupId));
  }, [data, selectedGroupIds]);

  // Sort rows
  const sortedRows = useMemo(() => {
    let sortableRows = [...filteredRows];
    if (sortConfig !== null) {
      sortableRows.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (sortConfig.key === "name") {
          aValue = a.groupName.toLowerCase();
          bValue = b.groupName.toLowerCase();
        } else if (sortConfig.key.startsWith("year_")) {
          const parts = sortConfig.key.split("_");
          const year = parseInt(parts[1]);
          const sub = parts[2] === "amount" ? "amount" : "percentage";
          aValue = a.years[year]?.[sub] || 0;
          bValue = b.years[year]?.[sub] || 0;
        } else if (sortConfig.key === "avg_amount") {
          aValue = a.average.amount;
          bValue = b.average.amount;
        } else if (sortConfig.key === "avg_pcnt") {
          aValue = a.average.percentage;
          bValue = b.average.percentage;
        }

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableRows;
  }, [filteredRows, sortConfig]);

  const onSort = (key: string) => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig?.key !== columnKey) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-30 group-hover:opacity-60 transition-opacity" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-primary animate-in fade-in zoom-in-50 duration-300" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-primary animate-in fade-in zoom-in-50 duration-300" />
    );
  };

  // Pie chart data from averages
  const pieData = useMemo(() => {
    return filteredRows
      .filter(row => row.average.percentage > 0)
      .map(row => ({
        name: row.groupName,
        value: row.average.percentage,
        amount: row.average.amount,
        color: row.color,
      }));
  }, [filteredRows]);

  // Calculate total represented percentage for the center label
  const totalPercentage = useMemo(() => {
    return pieData.reduce((acc, item) => acc + item.value, 0);
  }, [pieData]);

  // --- Custom Tooltip ---
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload;
      return (
        <div className="bg-background/80 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl ring-1 ring-black/5 min-w-[200px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-bold text-foreground">{entry.name}</span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Promedio Anu.:</span>
              <span className="font-mono font-medium">{formatCurrency(entry.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Participación:</span>
              <span className="font-mono font-bold text-primary">{formatPercent(entry.value)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading && !data) {
    return (
      <Card className="border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-44" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-[300px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <Card className="border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-6">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" /> Análisis por Agrupaciones Personalizadas
            </CardTitle>
            <CardDescription className="text-base">
              Agrupa tus categorías para obtener una visión financiera segmentada y comparativa.
            </CardDescription>
          </div>
          <GroupingManager categories={categories} onGroupsChanged={() => setRefreshKey(k => k + 1)} />
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-6">
            <TrendingUp className="h-10 w-10 text-primary/30" />
          </div>
          <h3 className="text-xl font-bold text-foreground">Sin Agrupaciones Definidas</h3>
          <p className="text-muted-foreground mt-2 max-w-sm">
            Configura tus agrupaciones personalizadas para empezar a visualizar el análisis multi-anual y la distribución de ventas.
          </p>
          <div className="mt-8">
            <GroupingManager categories={categories} onGroupsChanged={() => setRefreshKey(k => k + 1)} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-t border-t-primary/20 bg-background/60 backdrop-blur-xl shadow-[0_8px_30_px_rgb(0,0,0,0.04)] overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-6">
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" /> Análisis por Agrupaciones Personalizadas
          </CardTitle>
          <CardDescription className="text-base">
            Distribución estratégica y evolución histórica por grupos de negocio.
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <Tabs
            value={recordType}
            onValueChange={(v) => setRecordType(v as RecordType)}
            className="w-auto"
          >
            <TabsList className="grid w-[240px] grid-cols-2 bg-muted/50 backdrop-blur-sm border border-white/5 h-9">
              <TabsTrigger value="SALES_ORDER" className="text-[10px] font-bold gap-1.5 uppercase tracking-wider">
                <FileText className="h-3 w-3" /> Órdenes (OV)
              </TabsTrigger>
              <TabsTrigger value="INVOICE" className="text-[10px] font-bold gap-1.5 uppercase tracking-wider">
                <Receipt className="h-3 w-3" /> Facturas (FAC)
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="w-px h-6 bg-white/5" />
          
          {/* Group Multi-Select Filter */}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger>
              <Button 
                variant="outline" 
                size="sm"
                className="bg-background/40 border-white/10 hover:bg-background/60 h-9 gap-2 font-medium"
              >
                <Filter className="h-3.5 w-3.5 text-primary" />
                {selectedGroupIds.length === (data?.rows.length || 0) 
                  ? "Todos los Grupos" 
                  : `${selectedGroupIds.length} Grupos`}
                <Plus className="h-3 w-3 ml-1 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl" align="end">
              <Command>
                <CommandInput placeholder="Filtrar grupos..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No se encontraron grupos.</CommandEmpty>
                  <CommandGroup heading="Grupos de Análisis">
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
                          className="flex items-center gap-2 py-2"
                        >
                          <div 
                            className={cn(
                              "flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-all",
                              isSelected ? "bg-primary text-primary-foreground" : "opacity-30"
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                          <span className="flex-1 text-sm font-medium">{row.groupName}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
                <div className="p-2 border-t border-white/5 flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="xs" 
                    className="flex-1 text-[10px]"
                    onClick={() => setSelectedGroupIds(data?.rows.map(r => r.groupId) || [])}
                  >
                    Marcar todos
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="xs" 
                    className="flex-1 text-[10px] text-muted-foreground hover:text-destructive"
                    onClick={() => setSelectedGroupIds([])}
                  >
                    Limpiar
                  </Button>
                </div>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="w-px h-6 bg-white/5" />
          <GroupingManager categories={categories} onGroupsChanged={() => setRefreshKey(k => k + 1)} />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="flex flex-col overflow-hidden">

          {/* Data Matrix Table Section - NOW ON TOP */}
          <div className="p-0 overflow-x-auto border-b border-white/5">
            <div className="p-8 pb-4 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10">
                <TableIcon className="h-4 w-4 text-emerald-400" />
              </div>
              <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Matriz de Datos Financieros</h4>
            </div>

            <Table className="relative min-w-[1000px]">
              <TableHeader className="bg-black/5 dark:bg-white/5 backdrop-blur-md sticky top-0 z-10">
                <TableRow className="border-b-0 hover:bg-transparent text-foreground/80">
                  <TableHead 
                    className="font-bold text-foreground text-sm uppercase tracking-wider sticky left-0 bg-inherit/90 backdrop-blur-md border-r border-white/5 pr-6 py-4 cursor-pointer hover:text-primary transition-colors group"
                    onClick={() => onSort("name")}
                  >
                    <div className="flex items-center">
                      Grupo <SortIcon columnKey="name" />
                    </div>
                  </TableHead>
                  {data.years.map(year => (
                    <TableHead key={year} className="text-center font-bold text-foreground text-base py-4" colSpan={2}>
                      {year}
                    </TableHead>
                  ))}
                  <TableHead className="text-right font-bold text-primary text-base py-4 bg-primary/5" colSpan={2}>
                    PROMEDIO
                  </TableHead>
                </TableRow>
                <TableRow className="border-b-0 hover:bg-transparent text-[10px] uppercase tracking-wider text-muted-foreground/60 select-none">
                  <TableHead className="sticky left-0 bg-inherit/90 backdrop-blur-md border-r border-white/5" />
                  {data.years.map(year => (
                    <React.Fragment key={`sub-${year}`}>
                      <TableHead 
                        className="text-center border-l border-white/5 cursor-pointer hover:bg-white/5 hover:text-foreground transition-all group"
                        onClick={() => onSort(`year_${year}_amount`)}
                      >
                        <div className="flex items-center justify-center">
                          Monto <SortIcon columnKey={`year_${year}_amount`} />
                        </div>
                      </TableHead>
                      <TableHead 
                        className="text-center cursor-pointer hover:bg-white/5 hover:text-foreground transition-all group"
                        onClick={() => onSort(`year_${year}_percentage`)}
                      >
                        <div className="flex items-center justify-center">
                          % <SortIcon columnKey={`year_${year}_percentage`} />
                        </div>
                      </TableHead>
                    </React.Fragment>
                  ))}
                  <React.Fragment key="sub-avg">
                    <TableHead 
                      className="text-center bg-primary/5 border-l border-white/5 cursor-pointer hover:bg-primary/10 hover:text-primary transition-all group"
                      onClick={() => onSort("avg_amount")}
                    >
                      <div className="flex items-center justify-center font-bold">
                        Monto <SortIcon columnKey="avg_amount" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="text-center bg-primary/5 cursor-pointer hover:bg-primary/10 hover:text-primary transition-all group"
                      onClick={() => onSort("avg_pcnt")}
                    >
                      <div className="flex items-center justify-center font-bold">
                        % <SortIcon columnKey="avg_pcnt" />
                      </div>
                    </TableHead>
                  </React.Fragment>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row, idx) => (
                  <TableRow key={row.groupId} className={cn("group transition-colors", idx % 2 === 0 ? "bg-white/5 hover:bg-white/10" : "bg-transparent hover:bg-white/5")}>
                    <TableCell className="font-semibold text-foreground text-sm sticky left-0 bg-inherit/90 backdrop-blur-md border-r border-white/5 flex items-center gap-2 py-4">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: row.color }} />
                      {row.groupName}
                    </TableCell>

                    {data.years.map(year => {
                      const yearData = row.years[year] || { amount: 0, percentage: 0 };
                      return (
                        <React.Fragment key={`${row.groupId}-${year}`}>
                          <TableCell className="text-center font-mono text-sm border-l border-white/5">
                            {formatCurrency(yearData.amount)}
                          </TableCell>
                          <TableCell className="text-center font-bold text-sm">
                            <span className={cn(
                              yearData.percentage >= 50 ? "text-primary glow-text" : "text-muted-foreground"
                            )}>
                              {formatPercent(yearData.percentage)}
                            </span>
                          </TableCell>
                        </React.Fragment>
                      );
                    })}

                    {/* Promedio Column */}
                    <TableCell className="text-center font-mono text-sm bg-primary/5 border-l border-white/5 font-bold text-foreground">
                      {formatCurrency(row.average.amount)}
                    </TableCell>
                    <TableCell className="text-center font-black text-sm bg-primary/5 text-primary">
                      {formatPercent(row.average.percentage)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pie Chart Section - Distribution (Average) - NOW AT BOTTOM */}
          <div className="p-12 flex flex-col items-center">
            <div className="flex items-center gap-2 mb-8 w-full">
              <div className="p-1.5 rounded-lg bg-indigo-500/10">
                <PieChartIcon className="h-4 w-4 text-indigo-400" />
              </div>
              <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Distribución Promedio de Agrupaciones</h4>
            </div>

            <div className="h-[700px] w-full max-w-5xl relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <RechartsTooltip content={<CustomPieTooltip />} />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={160}
                    outerRadius={280}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    layout="horizontal"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '15px', paddingTop: '60px' }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Info */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-20">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={totalPercentage}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-7xl font-black text-foreground tracking-tighter"
                  >
                    {totalPercentage.toFixed(0)}%
                  </motion.span>
                </AnimatePresence>
                <span className="text-base text-muted-foreground uppercase font-bold tracking-[0.2em] mt-2 text-center">
                  Participación<br />del Negocio
                </span>
              </div>
            </div>
          </div>

        </div>
      </CardContent>

      <style jsx global>{`
        .glow-text {
          text-shadow: 0 0 10px hsl(var(--primary) / 0.5);
        }
      `}</style>
    </Card>
  );
}
