"use client";

import { Fragment, useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchCustomerItemSales, fetchMacroCategorias } from "@/lib/data-client";
import { customerHref } from "@/lib/customer-detail";
import type { CustomerItemRow } from "@/types/database";
import { usePeriod } from "@/components/providers/period-provider";
import { formatUSD } from "@/lib/constants";
import {
  BUCKET_LABELS,
  MACRO_CATEGORIAS_KEY,
  computeGrandTotals,
  mapaMacroCategorias,
} from "@/lib/customer-item";
import {
  SIN_CATEGORIA,
  customerCategoryToCsv,
  customerCategoryToExcel,
  filterCategoryRows,
  groupByCustomerCategory,
} from "@/lib/customer-category";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { SearchInput } from "@/components/common/search-input";
import { ExportMenu } from "@/components/common/export-menu";
import { EmptyState } from "@/components/common/empty-state";
import { YearCompareControls } from "@/components/common/year-compare-controls";
import { downloadXlsx, copySheetToClipboard } from "@/lib/excel-client";
import { downloadText } from "@/lib/download";
import { CardErrorBoundary } from "@/components/common/card-error-boundary";
import { runExport, XLSX_EXPORT_MESSAGES } from "@/lib/run-export";
import { CustomerCategoryCompareTable } from "@/components/cliente-categoria/customer-category-compare-table";

export default function ClienteCategoriaPage() {
  const { tipo, setTipo, year: anio, setYear: setAnio } = usePeriod();
  const [search, setSearch] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [yearA, setYearA] = useState(anio);
  const [yearB, setYearB] = useState(anio - 1);

  // Misma lectura y misma clave que /cliente-articulo: las dos secciones comparten la
  // caché y agregan las mismas filas, así que sus cifras cuadran por construcción.
  const { data, isLoading } = useQuery({
    queryKey: ["customer-item", { tipo, anio }],
    queryFn: () => fetchCustomerItemSales({ tipo, anio }),
    enabled: !compareMode,
  });

  // Clasificación guardada en Configuración. Hasta que llega, la tabla muestra el
  // esqueleto y la exportación está desactivada: nunca se reparte con el mapa vacío
  // (todo en Equipos). Si la consulta falla, el esqueleto se queda.
  const { data: macro } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => fetchMacroCategorias(),
  });
  const mapa = useMemo(() => mapaMacroCategorias(macro ?? []), [macro]);
  const sinClasificacion = macro === undefined;

  const rows = useMemo<CustomerItemRow[]>(() => data ?? [], [data]);
  const groups = useMemo(
    () => groupByCustomerCategory(filterCategoryRows(rows, search), mapa),
    [rows, search, mapa]
  );
  const grand = useMemo(() => computeGrandTotals(groups), [groups]);

  const exportCsv = () => {
    downloadText(customerCategoryToCsv(groups, grand), `ventas_cliente_categoria_${tipo}_${anio}.csv`);
    toast.success("CSV descargado");
  };

  const exportXlsx = () =>
    runExport(() => downloadXlsx([customerCategoryToExcel(groups, grand)], `ventas_cliente_categoria_${tipo}_${anio}.xlsx`), toast, XLSX_EXPORT_MESSAGES);

  const onCopy = async () => {
    try { await copySheetToClipboard(customerCategoryToExcel(groups, grand)); toast.success("Tabla copiada"); }
    catch { toast.error("No se pudo copiar"); }
  };

  const amount = (show: boolean, n: number) =>
    show ? <span className="tabular-nums">{formatUSD(n)}</span> : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Ventas por cliente × categoría</h1>
        <p className="text-sm text-muted-foreground">
          Por cliente, importe neto por categoría clasificado en 4 macro-categorías. En vivo de Zoho.
        </p>
      </div>

      {/* Controles servidor */}
      <div className="flex flex-wrap items-end gap-3">
        <RecordTypeToggle value={tipo as "SALES_ORDER" | "INVOICE"} onValueChange={(v) => setTipo(v)} />
        <YearCompareControls
          anio={anio}
          onAnioChange={setAnio}
          compareMode={compareMode}
          onCompareModeChange={setCompareMode}
          yearA={yearA}
          onYearAChange={setYearA}
          yearB={yearB}
          onYearBChange={setYearB}
        />
      </div>

      {compareMode ? (
        <CardErrorBoundary title="Comparativa cliente × categoría" resetKeys={[tipo, yearA, yearB]}>
          <CustomerCategoryCompareTable tipo={tipo as "SALES_ORDER" | "INVOICE"} yearA={yearA} yearB={yearB} />
        </CardErrorBoundary>
      ) : (
        <>
          {/* Controles cliente */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente o categoría…" />
            <ExportMenu onCopy={onCopy} onCsv={exportCsv} onXlsx={exportXlsx} disabled={groups.length === 0 || sinClasificacion} />
          </div>

          {isLoading || sinClasificacion ? (
            <Skeleton className="h-[500px] w-full rounded-xl" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Categoría</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.mano_obra}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.cr}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.equipos}</TableHead>
                    <TableHead className="text-right">{BUCKET_LABELS.operacion}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}><EmptyState message="Sin ventas en el año seleccionado." /></TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {groups.map((g) => (
                        <Fragment key={g.customer}>
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell colSpan={2}>
                              <Link href={customerHref(g.customer)} className="hover:text-primary hover:underline">{g.customer}</Link>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatUSD(g.totals.mano_obra)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatUSD(g.totals.cr)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatUSD(g.totals.equipos)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatUSD(g.totals.operacion)}</TableCell>
                          </TableRow>
                          {g.categorias.map((c) => (
                            // JSON.stringify distingue null de una categoría llamada "null" o
                            // vacía: la clave es única dentro del cliente.
                            <TableRow key={JSON.stringify(c.categoria)}>
                              <TableCell className="text-muted-foreground">{c.categoria ?? SIN_CATEGORIA}</TableCell>
                              <TableCell className="text-right tabular-nums">{c.cantidad}</TableCell>
                              <TableCell className="text-right">{amount(c.bucket === "mano_obra", c.importe)}</TableCell>
                              <TableCell className="text-right">{amount(c.bucket === "cr", c.importe)}</TableCell>
                              <TableCell className="text-right">{amount(c.bucket === "equipos", c.importe)}</TableCell>
                              <TableCell className="text-right">{amount(c.bucket === "operacion", c.importe)}</TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      ))}
                      <TableRow className="bg-muted/40 font-bold border-t-2">
                        <TableCell colSpan={2}>TOTAL ({groups.length} clientes)</TableCell>
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
        </>
      )}
    </div>
  );
}
