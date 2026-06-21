"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import type { ItemSalesRow, RecordType } from "@/types/database";
import { formatUSD } from "@/lib/constants";
import {
  filterAndSortItems,
  computeItemTotals,
  itemsToCsv,
  precioPromedio,
  categoriaLabel,
  type ItemSortKey,
  type SortDir,
} from "@/lib/item-sales";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

const todayISO = () => new Date().toISOString().slice(0, 10);
const yearStartISO = () => `${new Date().getFullYear()}-01-01`;

// Cabecera ordenable. Definida fuera del componente (no recrearla por render).
function SortableTh({
  k,
  label,
  right,
  sortKey,
  onSort,
}: {
  k: ItemSortKey;
  label: string;
  right?: boolean;
  sortKey: ItemSortKey;
  onSort: (k: ItemSortKey) => void;
}) {
  return (
    <TableHead className={right ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 hover:text-primary group"
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-primary" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

export default function ArticulosPage() {
  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [desde, setDesde] = useState(yearStartISO());
  const [hasta, setHasta] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [sortKey, setSortKey] = useState<ItemSortKey>("importe");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["item-sales", { tipo, desde, hasta }],
    queryFn: () => getItemSales({ tipo, desde, hasta }),
  });
  const rows = useMemo<ItemSalesRow[]>(() => data ?? [], [data]);

  const categorias = useMemo(
    () => Array.from(new Set(rows.map(categoriaLabel))).sort(),
    [rows]
  );
  const view = useMemo(
    () => filterAndSortItems(rows, { search, categoria, sortKey, sortDir }),
    [rows, search, categoria, sortKey, sortDir]
  );
  const totals = useMemo(() => computeItemTotals(view), [view]);

  const onSort = (k: ItemSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const exportCsv = () => {
    const blob = new Blob([itemsToCsv(view)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_articulo_${tipo}_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ventas por artículo</h1>
        <p className="text-sm text-muted-foreground">
          Detalle por artículo leído en vivo de Zoho. Importe bruto, igual al informe de Zoho.
        </p>
      </div>

      {/* Controles servidor: tipo + rango de fechas */}
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
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="w-[160px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="w-[160px]" />
        </div>
      </div>

      {/* Controles cliente: búsqueda + categoría + CSV */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU o nombre…"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoria || "all"} onValueChange={(v) => setCategoria(!v || v === "all" ? "" : v)}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={view.length === 0}>
          <Download className="mr-2 h-4 w-4" /> CSV
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTh k="sku" label="SKU" sortKey={sortKey} onSort={onSort} />
                <SortableTh k="nombre" label="Nombre" sortKey={sortKey} onSort={onSort} />
                <SortableTh k="categoria" label="Categoría" sortKey={sortKey} onSort={onSort} />
                <SortableTh k="cantidad" label="Cantidad" right sortKey={sortKey} onSort={onSort} />
                <SortableTh k="importe" label="Importe" right sortKey={sortKey} onSort={onSort} />
                <SortableTh k="precio" label="Precio promedio" right sortKey={sortKey} onSort={onSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Sin resultados para el rango/criterios seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {view.map((r) => (
                    <TableRow key={r.item_id}>
                      <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-muted-foreground">{categoriaLabel(r)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.cantidad}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUSD(r.importe)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUSD(precioPromedio(r))}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={3}>TOTAL ({view.length} artículos)</TableCell>
                    <TableCell className="text-right tabular-nums">{totals.cantidad}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(totals.importe)}</TableCell>
                    <TableCell />
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
