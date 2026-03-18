"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MONTHS, RECORD_TYPES, formatUSD, getYearRange } from "@/lib/constants";
import type { SalesRecord, Category, RecordType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { upsertSalesRecord, deleteSalesRecord } from "@/actions/sales-actions";
import { useAuth } from "@/components/providers/auth-provider";

export default function SalesPage() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFil, setYearFil] = useState(new Date().getFullYear());
  const [typeFil, setTypeFil] = useState<RecordType>("SALES_ORDER");

  const supabase = createClient();
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales_records")
        .select("*, categories(name, color)")
        .eq("record_year", yearFil)
        .eq("record_type", typeFil)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error("Error fetching sales records:", error);
      toast.error("Error al cargar registros");
    } finally {
      setLoading(false);
    }
  }, [yearFil, typeFil, supabase]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => 
      r.categories?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [records, searchTerm]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este registro?")) return;
    try {
      await deleteSalesRecord(id);
      toast.success("Registro eliminado");
      fetchRecords();
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  if (loading && records.length === 0) {
    return <Skeleton className="h-[500px] w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Listado de Registros</h1>
        <div className="flex gap-2">
           <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Registro
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por categoría..." 
            className="pl-10"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={String(yearFil)} onValueChange={v => setYearFil(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {getYearRange().map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFil} onValueChange={v => setTypeFil(v as RecordType)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RECORD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoría</TableHead>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.categories?.name}</TableCell>
                <TableCell>{MONTHS.find(m => m.value === r.record_month)?.label}</TableCell>
                <TableCell className="text-right">{formatUSD(Number(r.amount_usd))}</TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
