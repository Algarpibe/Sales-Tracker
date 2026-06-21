"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import type { CustomerYearRow, RecordType } from "@/types/database";
import { formatUSD } from "@/lib/constants";
import {
  buildCustomerMatrix,
  computeColumnTotals,
  filterCustomers,
  customerMatrixToCsv,
} from "@/lib/customer-sales";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";

const FIRST_YEAR = 2015;

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

export default function ClientesPage() {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => range(FIRST_YEAR, thisYear), [thisYear]);

  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [desdeAnio, setDesdeAnio] = useState(FIRST_YEAR);
  const [hastaAnio, setHastaAnio] = useState(thisYear);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo, desdeAnio, hastaAnio }],
    queryFn: () => getCustomerSales({ tipo, desdeAnio, hastaAnio }),
  });

  const rows = useMemo<CustomerYearRow[]>(() => data ?? [], [data]);
  const years = useMemo(
    () => (desdeAnio <= hastaAnio ? range(desdeAnio, hastaAnio) : []),
    [desdeAnio, hastaAnio]
  );
  const matrix = useMemo(() => buildCustomerMatrix(rows, years), [rows, years]);
  const visible = useMemo(() => filterCustomers(matrix, search), [matrix, search]);
  const totals = useMemo(() => computeColumnTotals(visible, years), [visible, years]);

  const exportCsv = () => {
    const blob = new Blob([customerMatrixToCsv(visible, years, totals.grand)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_cliente_${tipo}_${desdeAnio}_${hastaAnio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  const pct = (n: number) => (totals.grand > 0 ? `${((n / totals.grand) * 100).toFixed(1)}%` : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ventas por cliente</h1>
        <p className="text-sm text-muted-foreground">
          Matriz cliente × año leída en vivo de Zoho. Importe neto, igual al informe de Zoho.
        </p>
      </div>

      {/* Controles servidor */}
      <div className="flex flex-wrap items-end gap-3">
        <Select value={tipo} onValueChange={(v) => { if (v) setTipo(v as RecordType); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue>{tipo === "SALES_ORDER" ? "Órdenes de Venta (OV)" : "Facturas (FAC)"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INVOICE">Facturas (FAC)</SelectItem>
            <SelectItem value="SALES_ORDER">Órdenes de Venta (OV)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Desde año</label>
          <Select value={String(desdeAnio)} onValueChange={(v) => { if (v) setDesdeAnio(Number(v)); }}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Hasta año</label>
          <Select value={String(hastaAnio)} onValueChange={(v) => { if (v) setHastaAnio(Number(v)); }}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Controles cliente */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
          <Download className="mr-2 h-4 w-4" /> CSV
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-background min-w-[240px]">Cliente</TableHead>
                {years.map((y) => <TableHead key={y} className="text-right">{y}</TableHead>)}
                <TableHead className="text-right font-bold">Total</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={years.length + 3} className="text-center text-muted-foreground py-10">
                    Sin ventas en el rango seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {visible.map((r) => (
                    <TableRow key={r.customer}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">{r.customer}</TableCell>
                      {years.map((y) => (
                        <TableCell key={y} className="text-right tabular-nums">
                          {r.byYear[y] ? formatUSD(r.byYear[y]) : <span className="text-muted-foreground/30">—</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-bold">{formatUSD(r.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{pct(r.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell className="sticky left-0 z-10 bg-muted/40">TOTAL ({visible.length})</TableCell>
                    {years.map((y) => (
                      <TableCell key={y} className="text-right tabular-nums">{formatUSD(totals.byYear[y])}</TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{formatUSD(totals.grand)}</TableCell>
                    <TableCell className="text-right tabular-nums">100%</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
