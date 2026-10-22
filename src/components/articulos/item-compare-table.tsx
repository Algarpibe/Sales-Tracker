"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItemSales } from "@/actions/item-sales-actions";
import { buildItemCompare, type ItemCompareRow } from "@/lib/item-compare";
import { formatUSD } from "@/lib/constants";
import { DeltaCell } from "@/components/common/delta-cell";
import { SearchInput } from "@/components/common/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CompareSortKey = "sku" | "nombre" | "categoria" | "importeA" | "importeB" | "delta";
type Dir = "asc" | "desc";

const SIN_CAT = "Sin categoría";
const catLabel = (r: ItemCompareRow) => r.categoria ?? SIN_CAT;

function Th({ k, label, right, sortKey, sortDir, onSort }: {
  k: CompareSortKey; label: string; right?: boolean;
  sortKey: CompareSortKey; sortDir: Dir; onSort: (k: CompareSortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <TableHead className={right ? "text-right" : ""}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-primary", right && "flex-row-reverse")}>
        {label}
        {active ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  );
}

export function ItemCompareTable({ tipo, yearA, yearB }: { tipo: "SALES_ORDER" | "INVOICE"; yearA: number; yearB: number }) {
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [sortKey, setSortKey] = useState<CompareSortKey>("importeA");
  const [sortDir, setSortDir] = useState<Dir>("desc");

  const qA = useQuery({
    queryKey: ["item-sales", { tipo, desde: `${yearA}-01-01`, hasta: `${yearA}-12-31` }],
    queryFn: () => getItemSales({ tipo, desde: `${yearA}-01-01`, hasta: `${yearA}-12-31` }),
  });
  const qB = useQuery({
    queryKey: ["item-sales", { tipo, desde: `${yearB}-01-01`, hasta: `${yearB}-12-31` }],
    queryFn: () => getItemSales({ tipo, desde: `${yearB}-01-01`, hasta: `${yearB}-12-31` }),
  });
  const isLoading = qA.isLoading || qB.isLoading;

  const rows = useMemo(() => buildItemCompare(qA.data ?? [], qB.data ?? []), [qA.data, qB.data]);
  const categorias = useMemo(() => Array.from(new Set(rows.map(catLabel))).sort(), [rows]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const matchS = !q || (r.sku ?? "").toLowerCase().includes(q) || r.nombre.toLowerCase().includes(q);
      const matchC = !categoria || catLabel(r) === categoria;
      return matchS && matchC;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: ItemCompareRow): string | number => {
      switch (sortKey) {
        case "sku": return r.sku ?? "";
        case "nombre": return r.nombre;
        case "categoria": return catLabel(r);
        case "importeA": return r.importeA;
        case "importeB": return r.importeB;
        case "delta": return r.deltaPct ?? -Infinity;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, search, categoria, sortKey, sortDir]);

  const onSort = (k: CompareSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por SKU o nombre…" />
        <Select value={categoria || "all"} onValueChange={(v) => setCategoria(!v || v === "all" ? "" : v)}>
          <SelectTrigger aria-label="Categoría" className="w-[220px]"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : view.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <Th k="sku" label="SKU" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="nombre" label="Nombre" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="categoria" label="Categoría" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="importeA" label={`Importe ${yearA}`} right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="importeB" label={`Importe ${yearB}`} right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <Th k="delta" label="Δ%" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.map((r) => (
                <TableRow key={r.item_id}>
                  <TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                  <TableCell className="font-medium">{r.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{catLabel(r)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUSD(r.importeA)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUSD(r.importeB)}</TableCell>
                  <TableCell className="text-right tabular-nums"><DeltaCell a={r.importeA} b={r.importeB} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
