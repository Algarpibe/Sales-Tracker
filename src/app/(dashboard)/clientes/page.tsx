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
  sortCustomerMatrix,
  type CustomerSortKey,
  type CustomerSortDir,
} from "@/lib/customer-sales";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { RecordTypeSelect } from "@/components/common/record-type-select";
import { SearchInput } from "@/components/common/search-input";
import { CsvButton } from "@/components/common/csv-button";
import { EmptyState } from "@/components/common/empty-state";

const FIRST_YEAR = 2021;

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

  const [tipo, setTipo] = useState<RecordType>("INVOICE");
  const [desdeAnio, setDesdeAnio] = useState(FIRST_YEAR);
  const [hastaAnio, setHastaAnio] = useState(thisYear);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<CustomerSortKey>("total");
  const [sortDir, setSortDir] = useState<CustomerSortDir>("desc");

  const onSort = (k: CustomerSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["customer-sales", { tipo, desdeAnio, hastaAnio }],
    queryFn: () => getCustomerSales({ tipo, desdeAnio, hastaAnio }),
  });

  const rows = useMemo<CustomerYearRow[]>(() => data ?? [], [data]);
  const years = useMemo(
    () => (desdeAnio <= hastaAnio ? range(desdeAnio, hastaAnio) : []),
    [desdeAnio, hastaAnio]
  );
  const matrix = useMemo(() => buildCustomerMatrix(rows), [rows]);
  const visible = useMemo(() => filterCustomers(matrix, search), [matrix, search]);
  const sorted = useMemo(() => sortCustomerMatrix(visible, sortKey, sortDir), [visible, sortKey, sortDir]);
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
        <RecordTypeSelect value={tipo as "SALES_ORDER" | "INVOICE"} onValueChange={(v) => setTipo(v)} />
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
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente…" />
        <CsvButton onClick={exportCsv} disabled={visible.length === 0} />
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={years.length + 3}><EmptyState message="Sin ventas en el rango seleccionado." /></TableCell>
                </TableRow>
              ) : (
                <>
                  {sorted.map((r) => (
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
                    <TableCell className="text-right tabular-nums">{pct(totals.grand)}</TableCell>
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
