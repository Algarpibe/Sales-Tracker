"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MONTHS, RECORD_TYPES, formatUSD, getYearRange } from "@/lib/constants";
import type { SalesRecord, Category, RecordType } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit2, Save, X, Download } from "lucide-react";
import { toast } from "sonner";
import { upsertSalesRecord, getSalesData } from "@/actions/sales-actions";
import { getCategories } from "@/actions/category-actions";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";

interface PivotRow {
  category_id: string;
  category_name: string;
  months: Record<number, { amount: number; id: string | null }>;
  total: number;
}

export default function TablasPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [typeFilter, setTypeFilter] = useState<RecordType>("SALES_ORDER");
  const [isEditing, setIsEditing] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, Record<number, number>>>( {});

  const supabase = createClient();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [salesRes, catRes] = await Promise.all([
        getSalesData({
          year,
          record_type: typeFilter,
        }),
        getCategories(),
      ]);

      setRecords((salesRes as SalesRecord[]) || []);
      setCategories((catRes as Category[]) || []);
    } catch (err) {
      console.error("Error in fetchData:", err);
      toast.error("Error al cargar los datos", {
        description: (err as Error).message
      });
    } finally {
      setLoading(false);
    }
  }, [year, typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pivotRows = useMemo(() => {
    const map = new Map<string, PivotRow>();

    // Inicializar todas las categorías activas
    categories.forEach(cat => {
      map.set(cat.id, {
        category_id: cat.id,
        category_name: cat.name,
        months: {},
        total: 0,
      });
    });

    records.forEach((r: SalesRecord) => {
      if (map.has(r.category_id)) {
        const row = map.get(r.category_id)!;
        row.months[r.record_month] = {
          amount: Number(r.amount_usd),
          id: r.id,
        };
        row.total += Number(r.amount_usd);
      }
    });

    return Array.from(map.values());
  }, [records, categories]);

  const monthlyTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    MONTHS.forEach(m => totals[m.value] = 0);
    
    pivotRows.forEach(row => {
      MONTHS.forEach(m => {
        const val = pendingChanges[row.category_id]?.[m.value] !== undefined 
          ? pendingChanges[row.category_id][m.value] 
          : (row.months[m.value]?.amount ?? 0);
        totals[m.value] += val;
      });
    });
    
    return totals;
  }, [pivotRows, pendingChanges]);

  const cumulativeTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    let cumulative = 0;
    MONTHS.forEach(m => {
      cumulative += monthlyTotals[m.value];
      totals[m.value] = cumulative;
    });
    return totals;
  }, [monthlyTotals]);

  const grandTotal = useMemo(() => {
    return Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0);
  }, [monthlyTotals]);

  const handleInputChange = (categoryId: string, month: number, value: string) => {
    const amount = parseFloat(value);
    setPendingChanges(prev => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] || {}),
        [month]: isNaN(amount) ? 0 : amount
      }
    }));
  };

  const handleSaveChanges = async () => {
    const changesCount = Object.values(pendingChanges).reduce(
      (acc, months) => acc + Object.keys(months).length, 0
    );

    if (changesCount === 0) {
      setIsEditing(false);
      return;
    }

    const toastId = toast.loading(`Guardando ${changesCount} cambios...`);
    
    try {
      // Procesamiento secuencial para evitar bloqueos en la DB
      for (const [categoryId, months] of Object.entries(pendingChanges)) {
        for (const [month, amount] of Object.entries(months)) {
          await upsertSalesRecord({
            category_id: categoryId,
            record_type: typeFilter,
            amount_usd: amount,
            record_month: parseInt(month),
            record_year: year,
          });
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
      
      toast.success("Cambios guardados correctamente", { id: toastId });
      setPendingChanges({});
      setIsEditing(false);
      await fetchData();
      router.refresh();
    } catch (err) {
      console.error("Error al guardar:", err);
      toast.error("Error al guardar cambios", { 
        id: toastId,
        description: (err as Error).message 
      });
    }
  };

  const handleCancel = () => {
    setPendingChanges({});
    setIsEditing(false);
  };

  const handleExportCSV = () => {
    const headers = ["Categoría", ...MONTHS.map((m) => m.label), "Total"];
    const rows = pivotRows.map((row) => [
      row.category_name,
      ...MONTHS.map((m) => (row.months[m.value]?.amount ?? 0).toString()),
      row.total.toString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tabla_${typeFilter}_${year}.csv`;
    a.click();
    toast.success("CSV descargado");
  };

  if (loading && records.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tablas de Datos</h1>
          <p className="text-muted-foreground">
            Visualización y edición masiva — Estilo {typeFilter === "SALES_ORDER" ? "OV" : "FAC"} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              {isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleCancel}>
                    <X className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveChanges} className="bg-emerald-600 hover:bg-emerald-700">
                    <Save className="mr-2 h-4 w-4" />
                    Guardar Cambios
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setIsEditing(true)}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Editar Datos
                </Button>
              )}
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))} disabled={isEditing}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            {getYearRange().map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select 
          value={typeFilter} 
          onValueChange={(v) => setTypeFilter(v as RecordType)}
          disabled={isEditing}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Tipo de Dato">
              {typeFilter === "SALES_ORDER" ? "Órden de Venta (OV)" : "Facturas (FAC)"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RECORD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.value === "SALES_ORDER" ? "Órden de Venta (OV)" : "Facturas (FAC)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isEditing && (
          <Badge variant="outline" className="border-emerald-500 text-emerald-500 animate-pulse px-3 py-1">
            Modo Edición Activo
          </Badge>
        )}
      </div>

      {/* Main Table */}
      <div className="rounded-xl border bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="sticky left-0 z-20 bg-muted/80 backdrop-blur-md min-w-[200px] font-bold border-r">
                  Categoría
                </TableHead>
                {MONTHS.map((m) => (
                  <TableHead key={m.value} className="min-w-[110px] text-right font-semibold">
                    {m.label}
                  </TableHead>
                ))}
                <TableHead className="min-w-[130px] text-right font-bold bg-primary/5 text-primary">
                  TOTAL ANUAL
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pivotRows.map((row) => {
                const totalWithPending = MONTHS.reduce((acc, m) => {
                  const val = pendingChanges[row.category_id]?.[m.value] !== undefined 
                    ? pendingChanges[row.category_id][m.value] 
                    : (row.months[m.value]?.amount ?? 0);
                  return acc + val;
                }, 0);

                return (
                  <TableRow key={row.category_id} className="hover:bg-primary/5 transition-colors group">
                    <TableCell className="sticky left-0 z-10 bg-background/80 backdrop-blur-sm font-medium border-r group-hover:bg-primary/5">
                      {row.category_name}
                    </TableCell>
                    {MONTHS.map((m) => {
                      const hasPending = pendingChanges[row.category_id]?.[m.value] !== undefined;
                      const currentValue = hasPending 
                        ? pendingChanges[row.category_id][m.value] 
                        : (row.months[m.value]?.amount ?? 0);

                      return (
                        <TableCell key={m.value} className="p-0">
                          {isEditing ? (
                            <input
                              type="number"
                              className={cn(
                                "w-full h-11 px-3 text-right bg-transparent outline-none transition-all focus:bg-primary/10 focus:ring-1 focus:ring-primary/30",
                                hasPending && "text-emerald-500 font-semibold bg-emerald-500/5"
                              )}
                              defaultValue={currentValue === 0 ? "" : currentValue}
                              onChange={(e) => handleInputChange(row.category_id, m.value, e.target.value)}
                              placeholder="0.00"
                            />
                          ) : (
                            <div className="px-3 py-3 text-right tabular-nums">
                              {currentValue > 0 ? formatUSD(currentValue) : <span className="text-muted-foreground/30">—</span>}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-bold bg-primary/5 text-primary tabular-nums">
                      {formatUSD(totalWithPending)}
                    </TableCell>
                  </TableRow>
                );
              })}
              
              {/* Totals Row */}
              <TableRow className="bg-muted/30 font-bold hover:bg-muted/40 border-t-2">
                <TableCell className="sticky left-0 z-10 bg-muted/80 backdrop-blur-sm font-bold border-r">
                  TOTAL MENSUAL
                </TableCell>
                {MONTHS.map((m) => (
                  <TableCell key={m.value} className="px-3 py-3 text-right tabular-nums">
                    {monthlyTotals[m.value] > 0 ? formatUSD(monthlyTotals[m.value]) : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right font-bold bg-primary/10 text-primary tabular-nums">
                  {formatUSD(grandTotal)}
                </TableCell>
              </TableRow>

              {/* Cumulative Totals Row */}
              <TableRow className="bg-muted/10 font-bold hover:bg-muted/20 border-t italic">
                <TableCell className="sticky left-0 z-10 bg-muted/60 backdrop-blur-sm font-bold border-r">
                  TOTAL ACUMULADO
                </TableCell>
                {MONTHS.map((m) => (
                  <TableCell key={m.value} className="px-3 py-3 text-right tabular-nums text-muted-foreground/80">
                    {cumulativeTotals[m.value] > 0 ? formatUSD(cumulativeTotals[m.value]) : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right font-bold bg-muted/20 tabular-nums text-muted-foreground/80">
                  {formatUSD(grandTotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex justify-end text-sm text-muted-foreground italic px-2">
        * Todos los valores están expresados en USD.
      </div>
    </div>
  );
}
