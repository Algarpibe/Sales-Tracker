"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { getFavorites, toggleFavorite } from "@/actions/favorites-actions";
import { FavoriteStar } from "@/components/common/favorite-star";
import { Switch } from "@/components/ui/switch";
import type { CustomerYearRow } from "@/types/database";
import { usePeriod } from "@/components/providers/period-provider";
import { formatUSD } from "@/lib/constants";
import {
  buildCustomerMatrix,
  computeColumnTotals,
  filterCustomers,
  customerMatrixToCsv,
  customerMatrixToExcel,
  sortCustomerMatrix,
  hubCustomerNames,
  type CustomerSortKey,
  type CustomerSortDir,
} from "@/lib/customer-sales";
import { cn } from "@/lib/utils";
import { DeltaCell } from "@/components/common/delta-cell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { SearchInput } from "@/components/common/search-input";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/empty-state";
import { downloadXlsx, copySheetToClipboard } from "@/lib/excel-client";
import { runExport, XLSX_EXPORT_MESSAGES } from "@/lib/run-export";
import { SavedViewsMenu } from "@/components/clientes/saved-views-menu";
import type { ClientesViewState } from "@/lib/clientes-view-state";

// 2015 porque esta vista (y SOLO esta) incorpora el histórico previo al hub.
// Las otras nueve constantes FIRST_YEAR de la app siguen en 2021.
const FIRST_YEAR = 2015;

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

// Cabecera ordenable (declarada fuera del componente por react-hooks/static-components).
function SortHeader({
  label, colKey, sortKey, sortDir, onSort, right, sticky,
}: {
  label: string;
  colKey: CustomerSortKey;
  sortKey: CustomerSortKey;
  sortDir: CustomerSortDir;
  onSort: (k: CustomerSortKey) => void;
  right?: boolean;
  sticky?: boolean;
}) {
  const active = sortKey === colKey;
  return (
    <TableHead className={cn(right && "text-right", sticky && "sticky left-0 z-10 bg-background min-w-[240px]")}>
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={cn("inline-flex items-center gap-1 hover:text-primary", right && "flex-row-reverse")}
      >
        {label}
        {active ? (
          sortDir === "desc"
            ? <ArrowDown className="h-3 w-3 text-primary" />
            : <ArrowUp className="h-3 w-3 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export default function ClientesPage() {
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => range(FIRST_YEAR, thisYear), [thisYear]);

  const { tipo, setTipo } = usePeriod();
  const [desdeAnio, setDesdeAnio] = useState(FIRST_YEAR);
  const [hastaAnio, setHastaAnio] = useState(thisYear);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<CustomerSortKey>("total");
  const [sortDir, setSortDir] = useState<CustomerSortDir>("desc");
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState(thisYear);
  const [compareB, setCompareB] = useState(thisYear - 1);
  const [onlyFav, setOnlyFav] = useState(false);
  const qc = useQueryClient();
  const favQ = useQuery({ queryKey: ["favorites"], queryFn: getFavorites });
  const favSet = useMemo(() => new Set(favQ.data ?? []), [favQ.data]);
  const favMut = useMutation({
    mutationFn: toggleFavorite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
    onError: () => toast.error("No se pudo guardar el favorito"),
  });

  const currentView: ClientesViewState = useMemo(
    () => ({ tipo: tipo as "SALES_ORDER" | "INVOICE", desdeAnio, hastaAnio, search, sortKey, sortDir, compareMode, compareA, compareB, onlyFav }),
    [tipo, desdeAnio, hastaAnio, search, sortKey, sortDir, compareMode, compareA, compareB, onlyFav]
  );
  const applyView = (s: ClientesViewState) => {
    setTipo(s.tipo);
    setDesdeAnio(s.desdeAnio);
    setHastaAnio(s.hastaAnio);
    setSearch(s.search);
    setSortKey(s.sortKey);
    setSortDir(s.sortDir);
    setCompareMode(s.compareMode);
    setCompareA(s.compareA);
    setCompareB(s.compareB);
    setOnlyFav(s.onlyFav);
  };

  // Al desactivar la comparación, la columna Δ desaparece: si se estaba ordenando por ella, vuelve a Total.
  const onToggleCompare = (v: boolean) => {
    setCompareMode(v);
    if (!v && sortKey === "delta") { setSortKey("total"); setSortDir("desc"); }
  };

  const onSort = (k: CustomerSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo, desdeAnio, hastaAnio, includeHistory: true }],
    queryFn: () => getCustomerSales({ tipo, desdeAnio, hastaAnio, includeHistory: true }),
  });

  const rows = useMemo<CustomerYearRow[]>(() => data ?? [], [data]);
  const years = useMemo(
    () => (desdeAnio <= hastaAnio ? range(desdeAnio, hastaAnio) : []),
    [desdeAnio, hastaAnio]
  );
  const matrix = useMemo(() => buildCustomerMatrix(rows), [rows]);
  // Clientes con presencia en el hub. Los que solo tienen histórico no enlazan
  // al drill-down, porque esa página consulta únicamente el hub y saldría vacía.
  const conHub = useMemo(() => hubCustomerNames(rows), [rows]);
  const visible = useMemo(() => {
    const base = filterCustomers(matrix, search);
    return onlyFav ? base.filter((r) => favSet.has(r.customer)) : base;
  }, [matrix, search, onlyFav, favSet]);
  const sorted = useMemo(
    () => sortCustomerMatrix(visible, sortKey, sortDir, { a: compareA, b: compareB }),
    [visible, sortKey, sortDir, compareA, compareB]
  );
  const totals = useMemo(() => computeColumnTotals(visible, years), [visible, years]);
  // % siempre sobre el total GENERAL (toda la matriz, sin filtrar) — no el subconjunto.
  const grandAll = useMemo(() => computeColumnTotals(matrix, years).grand, [matrix, years]);

  const exportCsv = () => {
    const blob = new Blob([customerMatrixToCsv(visible, years, grandAll)], {
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

  const exportXlsx = () =>
    runExport(() => downloadXlsx([customerMatrixToExcel(visible, years, grandAll)], `ventas_cliente_${tipo}_${desdeAnio}_${hastaAnio}.xlsx`), toast, XLSX_EXPORT_MESSAGES);

  const onCopy = async () => {
    try { await copySheetToClipboard(customerMatrixToExcel(visible, years, grandAll)); toast.success("Tabla copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };

  const pct = (n: number) => (grandAll > 0 ? `${((n / grandAll) * 100).toFixed(1)}%` : "—");

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
        <RecordTypeToggle value={tipo as "SALES_ORDER" | "INVOICE"} onValueChange={(v) => setTipo(v)} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Desde año</label>
          <Select value={String(desdeAnio)} onValueChange={(v) => { if (v) setDesdeAnio(Number(v)); }}>
            <SelectTrigger aria-label="Desde año" className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Hasta año</label>
          <Select value={String(hastaAnio)} onValueChange={(v) => { if (v) setHastaAnio(Number(v)); }}>
            <SelectTrigger aria-label="Hasta año" className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Controles cliente */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente…" />
        <ExportMenu onCopy={onCopy} onCsv={exportCsv} onXlsx={exportXlsx} disabled={visible.length === 0} />
        <label className="flex items-center gap-2 self-center text-sm">
          <Switch checked={onlyFav} onCheckedChange={setOnlyFav} /> Solo favoritos
        </label>
        <SavedViewsMenu current={currentView} onApply={applyView} />
        <div className="flex items-end gap-2 ml-auto">
          <label className="flex items-center gap-2 self-center text-sm">
            <Switch checked={compareMode} onCheckedChange={onToggleCompare} /> Comparar años
          </label>
          {compareMode && (
            <>
              <Select value={String(compareA)} onValueChange={(v) => { if (v) setCompareA(Number(v)); }}>
                <SelectTrigger aria-label="Año A" className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground self-center">vs</span>
              <Select value={String(compareB)} onValueChange={(v) => { if (v) setCompareB(Number(v)); }}>
                <SelectTrigger aria-label="Año B" className="w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Cliente" colKey="customer" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky />
                {years.map((y) => (
                  <SortHeader key={y} label={String(y)} colKey={y} sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
                ))}
                <SortHeader label="Total" colKey="total" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
                <TableHead className="text-right">%</TableHead>
                {compareMode && (
                  <SortHeader label={`Δ ${compareA}/${compareB}`} colKey="delta" sortKey={sortKey} sortDir={sortDir} onSort={onSort} right />
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={years.length + (compareMode ? 4 : 3)}><EmptyState message="Sin ventas en el rango seleccionado." /></TableCell>
                </TableRow>
              ) : (
                <>
                  {sorted.map((r) => (
                    <TableRow key={r.customer}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">
                        <span className="inline-flex items-center gap-2">
                          <FavoriteStar active={favSet.has(r.customer)} onToggle={() => favMut.mutate(r.customer)} />
                          {conHub.has(r.customer) ? (
                            <Link href={`/clientes/${encodeURIComponent(r.customer)}`} className="hover:text-primary hover:underline">{r.customer}</Link>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              {r.customer}
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                solo histórico
                              </span>
                            </span>
                          )}
                        </span>
                      </TableCell>
                      {years.map((y) => (
                        <TableCell key={y} className="text-right tabular-nums">
                          {r.byYear[y] ? formatUSD(r.byYear[y]) : <span className="text-muted-foreground/30">—</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-bold">{formatUSD(r.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{pct(r.total)}</TableCell>
                      {compareMode && (
                        <TableCell className="text-right tabular-nums"><DeltaCell a={r.byYear[compareA] ?? 0} b={r.byYear[compareB] ?? 0} /></TableCell>
                      )}
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell className="sticky left-0 z-10 bg-muted/40">TOTAL ({visible.length})</TableCell>
                    {years.map((y) => (
                      <TableCell key={y} className="text-right tabular-nums">{formatUSD(totals.byYear[y])}</TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{formatUSD(totals.grand)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(totals.grand)}</TableCell>
                    {compareMode && (
                      <TableCell className="text-right tabular-nums"><DeltaCell a={totals.byYear[compareA] ?? 0} b={totals.byYear[compareB] ?? 0} /></TableCell>
                    )}
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
