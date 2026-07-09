"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import type { ItemSalesRow, RecordType } from "@/types/database";
import { formatUSD } from "@/lib/constants";
import {
  filterAndSortItems,
  computeItemTotals,
  itemsToCsv,
  itemsToExcel,
  precioPromedio,
  categoriaLabel,
  type ItemSortKey,
  type SortDir,
} from "@/lib/item-sales";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import { SearchInput } from "@/components/common/search-input";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/empty-state";
import { downloadXlsx } from "@/lib/excel-client";

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

function ArticulosContent() {
  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [desde, setDesde] = useState(yearStartISO());
  const [hasta, setHasta] = useState(todayISO());
  const searchParams = useSearchParams();
  // Deriva la búsqueda del ?q durante el render (patrón React sin efecto): al
  // cambiar el parámetro (navegación desde cmd-k) resetea; al teclear no interfiere.
  const qParam = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(qParam);
  const [prevQ, setPrevQ] = useState(qParam);
  if (qParam !== prevQ) {
    setPrevQ(qParam);
    setSearch(qParam);
  }
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

  const exportXlsx = () => {
    downloadXlsx([itemsToExcel(view)], `ventas_articulo_${tipo}_${desde}_${hasta}.xlsx`);
    toast.success("Excel descargado");
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
        <RecordTypeSelect value={tipo as "SALES_ORDER" | "INVOICE"} onValueChange={(v) => setTipo(v)} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={desde} min="2021-01-01" max={hasta} onChange={(e) => setDesde(e.target.value)} className="w-[160px]" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={hasta} min={desde < "2021-01-01" ? "2021-01-01" : desde} onChange={(e) => setHasta(e.target.value)} className="w-[160px]" />
        </div>
      </div>

      {/* Controles cliente: búsqueda + categoría + CSV */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por SKU o nombre…" />
        <Select value={categoria || "all"} onValueChange={(v) => setCategoria(!v || v === "all" ? "" : v)}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <ExportMenu onCsv={exportCsv} onXlsx={exportXlsx} disabled={view.length === 0} />
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
                  <TableCell colSpan={6}><EmptyState message="Sin resultados para el rango/criterios seleccionados." /></TableCell>
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

export default function ArticulosPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full rounded-xl" />}>
      <ArticulosContent />
    </Suspense>
  );
}
