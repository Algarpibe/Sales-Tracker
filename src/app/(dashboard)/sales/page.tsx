"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MONTHS, RECORD_TYPES, formatUSD, getYearRange } from "@/lib/constants";
import type { SalesRecord, RecordType } from "@/types/database";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { getSalesData } from "@/actions/sales-actions";

export default function SalesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFil, setYearFil] = useState(new Date().getFullYear());
  const [typeFil, setTypeFil] = useState<RecordType>("SALES_ORDER");

  const { data, isLoading: loading } = useQuery({
    queryKey: ["sales", { year: yearFil, record_type: typeFil }],
    queryFn: () => getSalesData({ year: yearFil, record_type: typeFil }),
  });
  const records: SalesRecord[] = data ?? [];

  const filteredRecords = useMemo(() => {
    return records.filter(r =>
      r.categories?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [records, searchTerm]);

  if (loading && records.length === 0) {
    return <Skeleton className="h-[500px] w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Listado de Registros</h1>
          <p className="text-sm text-muted-foreground">
            Datos sincronizados automáticamente desde Zoho (solo lectura).
          </p>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.categories?.name}</TableCell>
                <TableCell>{MONTHS.find(m => m.value === r.record_month)?.label}</TableCell>
                <TableCell className="text-right">{formatUSD(Number(r.amount_usd))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
