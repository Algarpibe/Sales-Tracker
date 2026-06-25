"use client";

import { Fragment, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import type { CustomerItemRow, RecordType } from "@/types/database";
import { formatUSD } from "@/lib/constants";
import {
  bucketForCategory,
  filterRows,
  groupByCustomer,
  computeGrandTotals,
  customerItemToCsv,
} from "@/lib/customer-item";
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

const FIRST_YEAR = 2021;

export default function ClienteArticuloPage() {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => {
    const a: number[] = [];
    for (let y = FIRST_YEAR; y <= thisYear; y++) a.push(y);
    return a;
  }, [thisYear]);

  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [anio, setAnio] = useState(thisYear);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo, anio }],
    queryFn: () => getCustomerItemSales({ tipo, anio }),
  });

  const rows = useMemo<CustomerItemRow[]>(() => data ?? [], [data]);
  const groups = useMemo(() => groupByCustomer(filterRows(rows, search)), [rows, search]);
  const grand = useMemo(() => computeGrandTotals(groups), [groups]);

  const exportCsv = () => {
    const blob = new Blob([customerItemToCsv(groups, grand)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_cliente_articulo_${tipo}_${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  const amount = (show: boolean, n: number) =>
    show ? <span className="tabular-nums">{formatUSD(n)}</span> : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ventas por cliente × artículo</h1>
        <p className="text-sm text-muted-foreground">
          Por cliente, importe neto por artículo clasificado en 4 macro-categorías. En vivo de Zoho.
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
          <label className="text-xs text-muted-foreground">Año</label>
          <Select value={String(anio)} onValueChange={(v) => { if (v) setAnio(Number(v)); }}>
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
          <Input placeholder="Buscar cliente, artículo o SKU…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={groups.length === 0}>
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
                <TableHead className="min-w-[120px]">SKU</TableHead>
                <TableHead className="min-w-[140px]">Marca</TableHead>
                <TableHead className="min-w-[220px]">Nombre</TableHead>
                <TableHead className="min-w-[140px]">Categoría</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Mano de Obra / Cal</TableHead>
                <TableHead className="text-right">C&amp;R</TableHead>
                <TableHead className="text-right">Equipos</TableHead>
                <TableHead className="text-right">Operación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    Sin ventas en el año seleccionado.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {groups.map((g) => (
                    <Fragment key={g.customer}>
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={5}>{g.customer}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totals.mano_obra)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totals.cr)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totals.equipos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totals.operacion)}</TableCell>
                      </TableRow>
                      {g.items.map((it, i) => {
                        const b = bucketForCategory(it.categoria);
                        return (
                          <TableRow key={`${g.customer}-${i}`}>
                            <TableCell className="font-mono text-xs">{it.sku ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{it.marca ?? "—"}</TableCell>
                            <TableCell>{it.nombre}</TableCell>
                            <TableCell className="text-muted-foreground">{it.categoria ?? "Sin categoría"}</TableCell>
                            <TableCell className="text-right tabular-nums">{it.cantidad}</TableCell>
                            <TableCell className="text-right">{amount(b === "mano_obra", it.importe)}</TableCell>
                            <TableCell className="text-right">{amount(b === "cr", it.importe)}</TableCell>
                            <TableCell className="text-right">{amount(b === "equipos", it.importe)}</TableCell>
                            <TableCell className="text-right">{amount(b === "operacion", it.importe)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={5}>TOTAL ({groups.length} clientes)</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(grand.mano_obra)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(grand.cr)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(grand.equipos)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(grand.operacion)}</TableCell>
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
