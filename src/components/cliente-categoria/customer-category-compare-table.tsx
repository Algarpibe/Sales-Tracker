"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getCustomerItemSales } from "@/actions/customer-item-actions";
import { SIN_CATEGORIA, filterCategoryRows } from "@/lib/customer-category";
import { buildCustomerCategoryCompare } from "@/lib/customer-category-compare";
import { customerHref } from "@/lib/customer-detail";
import { formatUSD } from "@/lib/constants";
import { DeltaCell } from "@/components/common/delta-cell";
import { SearchInput } from "@/components/common/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";

export function CustomerCategoryCompareTable({ tipo, yearA, yearB }: { tipo: "SALES_ORDER" | "INVOICE"; yearA: number; yearB: number }) {
  const [search, setSearch] = useState("");

  // Misma clave que la sección de artículos: si ya se vieron esos años allí, no se
  // vuelven a pedir al hub.
  const qA = useQuery({ queryKey: ["customer-item", { tipo, anio: yearA }], queryFn: () => getCustomerItemSales({ tipo, anio: yearA }) });
  const qB = useQuery({ queryKey: ["customer-item", { tipo, anio: yearB }], queryFn: () => getCustomerItemSales({ tipo, anio: yearB }) });
  const isLoading = qA.isLoading || qB.isLoading;

  const groups = useMemo(
    () => buildCustomerCategoryCompare(filterCategoryRows(qA.data ?? [], search), filterCategoryRows(qB.data ?? [], search)),
    [qA.data, qB.data, search]
  );
  const grand = useMemo(() => {
    const totalA = groups.reduce((s, g) => s + g.totalA, 0);
    const totalB = groups.reduce((s, g) => s + g.totalB, 0);
    return { totalA, totalB };
  }, [groups]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente o categoría…" />
      </div>

      {isLoading ? (
        <Skeleton className="h-[500px] w-full rounded-xl" />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Categoría</TableHead>
                <TableHead className="text-right">Importe {yearA}</TableHead>
                <TableHead className="text-right">Importe {yearB}</TableHead>
                <TableHead className="text-right">Δ%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}><EmptyState message="Sin ventas en los años seleccionados." /></TableCell>
                </TableRow>
              ) : (
                <>
                  {groups.map((g) => (
                    <Fragment key={g.customer}>
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>
                          <Link href={customerHref(g.customer)} className="hover:text-primary hover:underline">{g.customer}</Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totalA)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(g.totalB)}</TableCell>
                        <TableCell className="text-right tabular-nums"><DeltaCell a={g.totalA} b={g.totalB} /></TableCell>
                      </TableRow>
                      {g.categorias.map((c) => (
                        // JSON.stringify distingue null de una categoría llamada "null" o
                        // vacía: la clave es única dentro del cliente.
                        <TableRow key={JSON.stringify(c.categoria)}>
                          <TableCell className="text-muted-foreground">{c.categoria ?? SIN_CATEGORIA}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatUSD(c.importeA)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatUSD(c.importeB)}</TableCell>
                          <TableCell className="text-right tabular-nums"><DeltaCell a={c.importeA} b={c.importeB} /></TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell>TOTAL ({groups.length} clientes)</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(grand.totalA)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUSD(grand.totalB)}</TableCell>
                    <TableCell className="text-right tabular-nums"><DeltaCell a={grand.totalA} b={grand.totalB} /></TableCell>
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
