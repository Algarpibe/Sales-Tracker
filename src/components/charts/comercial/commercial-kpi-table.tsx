"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCategories } from "@/actions/category-actions";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import {
  getKpiDealsMonthly,
  getKpiMonthlySales,
  getKpiTargets,
  getKpiWonDealsMonthly,
  getSalespeople,
  type KpiScope,
  type KpiTargetRow,
} from "@/actions/kpi-actions";
import { getSalesData } from "@/actions/sales-actions";
import { firstYearByCustomer } from "@/lib/analytics-comercial";
import { COMMERCIAL_KPIS, KPI_UNIT_LABEL, type KpiDef, type KpiUnit } from "@/lib/commercial-kpis";
import {
  attainment, esTratoDeClienteNuevo, esVentaDeClienteNuevo, kpiAverage, kpiContribution,
  monthBreakdown, periodTotals, scoreboard, splitDealsNewExisting, splitNewExisting, toMonthlySeries,
  type BreakdownInput,
} from "@/lib/kpi-score";
import { customerHref } from "@/lib/customer-detail";
import { stGrowthByQuarter } from "@/lib/tech-service";
import { CHART_HELP } from "@/lib/chart-help";
import { MONTHS, RECORD_TYPES, formatPct, formatUSD } from "@/lib/constants";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Category, SalesRecord } from "@/types/database";

// Valor del selector para el total de la compañía: el ámbito real es null, pero
// un Select necesita una cadena. Mismo centinela que la pantalla de Configuración.
const TOTAL = "__total__";
const TOTAL_LABEL = "Total compañía";

// El histórico de clientes arranca en 2015. Aquí solo sirve para saber en qué año
// compró por primera vez cada cliente, de compañía y sobre facturas: así el reparto
// nuevos/existentes no depende del comercial ni del conmutador OV/FAC.
const HISTORY_FIRST_YEAR = 2015;

const MESES = MONTHS.length;

/** "mensual" -> "Mensual". Con CSS, `capitalize` dejaría "nº" como "Nº". */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatValor(value: number, unit: KpiUnit): string {
  if (unit === "usd") return formatUSD(value);
  if (unit === "pct") return formatPct(value);
  return String(value);
}

/** Cuántos cubos tiene esa periodicidad. Se le pregunta al propio helper para no
 *  duplicar aquí la tabla de meses por cubo. */
function cubosDe(def: KpiDef): number {
  return periodTotals(new Array(MESES).fill(0), def.period).length;
}

interface FilaKpi {
  def: KpiDef;
  /** Doce meses; null donde ese KPI no tiene valor que enseñar. */
  meses: (number | null)[];
  /** Cumplimiento del periodo, colgado del mes que lo cierra. */
  cierres: (number | null)[];
  promedio: number | null;
  peso: number;
  aporte: number | null;
}

/**
 * Una fila de la tabla. `periodos` son los valores ya agregados por periodo y
 * `mensual` la serie de doce meses cuando el KPI la tiene; cuando no, el valor
 * del periodo se enseña en el mes que lo cierra.
 */
function construirFila(
  def: KpiDef,
  periodos: (number | null)[],
  meta: KpiTargetRow | undefined,
  mensual: number[] | null
): FilaKpi {
  // attainment devuelve null sin meta: un cero diría "no cumplió" y lo cierto es
  // que en ese ámbito no hay con qué comparar.
  const cumplimiento = periodos.map((v) => (v === null ? null : attainment(v, meta?.target_value ?? 0)));
  const paso = MESES / periodos.length;
  const meses: (number | null)[] = mensual ? [...mensual] : new Array(MESES).fill(null);
  const cierres: (number | null)[] = new Array(MESES).fill(null);
  for (const [i, valor] of periodos.entries()) {
    const cierre = (i + 1) * paso - 1;
    if (!mensual) meses[cierre] = valor;
    cierres[cierre] = cumplimiento[i];
  }
  const promedio = kpiAverage(cumplimiento);
  const peso = meta?.weight_pct ?? 0;
  return {
    def,
    meses,
    cierres,
    promedio,
    peso,
    aporte: promedio === null || peso <= 0 ? null : kpiContribution(promedio, peso),
  };
}

/** Serie de un desglose: los mismos dos nombres que ya usan `monthBreakdown` y los
 *  `split*` de kpi-score. */
type Serie = "nuevos" | "existentes";

/**
 * De qué lista y serie tira el desglose de cada fila pulsable. Solo ventas y
 * generación de tratos traen la venta o el trato fila a fila; el resto de KPIs son
 * agregados (conteos por fase, porcentajes) y no tienen nada que desglosar.
 */
function breakdownSourceFor(
  key: string,
  mensualesBreakdown: BreakdownInput[],
  tratosBreakdown: BreakdownInput[]
): { rows: BreakdownInput[]; serie: Serie } | null {
  switch (key) {
    case "ventas_nuevos":
      return { rows: mensualesBreakdown, serie: "nuevos" };
    case "ventas_existentes":
      return { rows: mensualesBreakdown, serie: "existentes" };
    case "tratos_nuevos":
      return { rows: tratosBreakdown, serie: "nuevos" };
    case "tratos_existentes":
      return { rows: tratosBreakdown, serie: "existentes" };
    default:
      return null;
  }
}

/** Celda de mes que el usuario ha pulsado: el KPI, el mes (0-indexado) y de dónde
 *  sacar su desglose. Lo suficiente para que el diálogo recalcule `monthBreakdown`
 *  y no pueda mostrar algo distinto que la cifra de la celda. */
interface CeldaSeleccionada {
  def: KpiDef;
  mesIndex: number;
  rows: BreakdownInput[];
  serie: Serie;
}

export function CommercialKpiTable({
  recordType,
  year,
}: {
  recordType: "SALES_ORDER" | "INVOICE";
  year: number;
}) {
  const { profile } = useAuth();
  const thisYear = new Date().getFullYear();
  const [owner, setOwner] = useState<string>(TOTAL);
  const salesperson: KpiScope = owner === TOTAL ? null : owner;
  const [celda, setCelda] = useState<CeldaSeleccionada | null>(null);

  const vendedoresQ = useQuery({
    queryKey: ["kpi-salespeople"],
    queryFn: () => getSalespeople(),
  });

  // keepPreviousData en las cuatro consultas que dependen del ámbito: cambiar de
  // comercial es un filtro, no una pantalla nueva, y desmontar la tabla en cada
  // cambio la haría parpadear entera.
  const metasQ = useQuery({
    queryKey: ["kpi-targets", year, owner],
    queryFn: () => getKpiTargets(year, salesperson),
    placeholderData: keepPreviousData,
  });
  const mensualesQ = useQuery({
    queryKey: ["kpi-monthly", recordType, year, owner],
    queryFn: () => getKpiMonthlySales(recordType, year, salesperson),
    placeholderData: keepPreviousData,
  });
  // Los tratos no dependen del conmutador OV/FAC: en CRM no hay tal cosa.
  const tratosQ = useQuery({
    queryKey: ["kpi-deals", year, owner],
    queryFn: () => getKpiDealsMonthly(year, salesperson),
    placeholderData: keepPreviousData,
  });
  // Los ganados van aparte de los generados: se cuentan por fecha de cierre y
  // filtrando por la fase ganadora, asi que no se pueden deducir de los de arriba.
  const ganadosQ = useQuery({
    queryKey: ["kpi-won-deals", year, owner],
    queryFn: () => getKpiWonDealsMonthly(year, salesperson),
    placeholderData: keepPreviousData,
  });

  // Misma clave exacta que /clientes y la ficha de cliente, para compartir su caché.
  const historicoQ = useQuery({
    queryKey: ["customer-sales", { tipo: "INVOICE", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }],
    queryFn: () => getCustomerSales({ tipo: "INVOICE", desdeAnio: HISTORY_FIRST_YEAR, hastaAnio: thisYear, includeHistory: true }),
  });

  // incremento_st no sale del hub: sale de sales_records cruzado con las
  // categorías. Las dos claves son las que ya carga analytics/page.tsx.
  const ventasQ = useQuery({ queryKey: ["sales", {}], queryFn: () => getSalesData({}) });
  const categoriasQ = useQuery({ queryKey: ["categories"], queryFn: getCategories });

  const metas = useMemo<KpiTargetRow[]>(() => metasQ.data ?? [], [metasQ.data]);
  const mensuales = useMemo(() => mensualesQ.data ?? [], [mensualesQ.data]);
  const tratos = useMemo(() => tratosQ.data ?? [], [tratosQ.data]);
  const ganados = useMemo(() => ganadosQ.data ?? [], [ganadosQ.data]);
  const historico = useMemo(() => historicoQ.data ?? [], [historicoQ.data]);
  const registros = useMemo<SalesRecord[]>(() => ventasQ.data ?? [], [ventasQ.data]);
  const categorias = useMemo<Category[]>(() => (categoriasQ.data as Category[]) ?? [], [categoriasQ.data]);

  const { filas, mensualesBreakdown, tratosBreakdown } = useMemo(() => {
    const porClave = new Map(metas.map((m) => [m.kpi_key, m]));
    // Un solo mapa de primer año para los dos repartos: el de ventas y el de
    // tratos, y para el desglose de sus celdas, que usa los mismos predicados.
    const primerAnio = firstYearByCustomer(historico);
    const split = splitNewExisting(mensuales, primerAnio, year);
    const tratosSplit = splitDealsNewExisting(tratos, primerAnio, year);
    const catMap = new Map<string, string>(categorias.map((c) => [String(c.id), String(c.name)]));
    // De compañía a propósito: las líneas de Servicio Técnico no llevan comercial asignado.
    const st = stGrowthByQuarter(
      registros.filter((r) => r.record_year === year),
      registros.filter((r) => r.record_year === year - 1),
      catMap,
      recordType
    );

    // Filas de origen ya clasificadas con los mismos predicados que usa el reparto,
    // para que el diálogo de detalle no pueda decir algo distinto que la celda.
    const mensualesBreakdown: BreakdownInput[] = mensuales.map((r) => ({
      nombre: r.customer,
      mes: r.mes,
      valor: r.importe,
      nuevo: esVentaDeClienteNuevo(r.customer, primerAnio, year),
    }));
    const tratosBreakdown: BreakdownInput[] = tratos.map((r) => ({
      nombre: r.account_name,
      mes: r.mes,
      valor: r.tratos,
      nuevo: esTratoDeClienteNuevo(r.account_name, primerAnio, year),
    }));

    const filas = COMMERCIAL_KPIS.map((def) => {
      const meta = porClave.get(def.key);
      if (def.key === "ventas_nuevos") {
        return construirFila(def, periodTotals(split.nuevos, def.period), meta, split.nuevos);
      }
      if (def.key === "ventas_existentes") {
        return construirFila(def, periodTotals(split.existentes, def.period), meta, split.existentes);
      }
      if (def.key === "tratos_nuevos") {
        const serie = tratosSplit.nuevos;
        return construirFila(def, periodTotals(serie, def.period), meta, serie);
      }
      if (def.key === "tratos_existentes") {
        const serie = tratosSplit.existentes;
        return construirFila(def, periodTotals(serie, def.period), meta, serie);
      }
      if (def.key === "tratos_ganados") {
        const serie = toMonthlySeries(ganados);
        return construirFila(def, periodTotals(serie, def.period), meta, serie);
      }
      if (def.key === "incremento_st") return construirFila(def, st, meta, null);
      return construirFila(def, new Array(cubosDe(def)).fill(null), meta, null);
    });

    return { filas, mensualesBreakdown, tratosBreakdown };
  }, [metas, mensuales, tratos, ganados, historico, registros, categorias, recordType, year]);

  const marcador = useMemo(
    () => scoreboard(filas.map((f) => ({ average: f.promedio, weight: f.peso }))),
    [filas]
  );
  const aporteTotal = useMemo(() => filas.reduce((s, f) => s + (f.aporte ?? 0), 0), [filas]);

  const cargando =
    metasQ.isPending || mensualesQ.isPending || tratosQ.isPending || ganadosQ.isPending ||
    historicoQ.isPending || ventasQ.isPending || categoriasQ.isPending;
  const refrescando =
    metasQ.isPlaceholderData || mensualesQ.isPlaceholderData || tratosQ.isPlaceholderData ||
    ganadosQ.isPlaceholderData;
  // Sin ventas del ámbito y sin metas, la tabla solo enseñaría guiones.
  const sinDatos = mensuales.length === 0 && metas.length === 0;
  const sinMetas = !metas.some((m) => m.weight_pct > 0);
  const ambito = owner === TOTAL ? TOTAL_LABEL : owner;

  // Contenido del diálogo de detalle: se recalcula con `monthBreakdown`, la misma
  // función que ya prueba que su suma cuadra con la celda, para que el detalle no
  // pueda decir algo distinto que la cifra pulsada.
  const detalle = celda ? monthBreakdown(celda.rows, celda.mesIndex + 1, celda.serie) : [];
  const detalleEnlaza = celda ? celda.def.key === "ventas_nuevos" || celda.def.key === "ventas_existentes" : false;
  const detalleTotal = detalle.reduce((s, r) => s + r.valor, 0);
  const tipoRegistroLabel = RECORD_TYPES.find((t) => t.value === recordType)?.label ?? recordType;

  return (
    <>
      <Card className="flex h-full flex-col border-border/40 bg-card/30 backdrop-blur-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CardTitle className="text-base font-semibold">KPIs comerciales {year}</CardTitle>
              <InfoTooltip text={CHART_HELP.kpisComerciales} />
            </span>
            <p className="text-xs text-muted-foreground">
              Valor de cada KPI mes a mes y, bajo el mes que cierra cada periodo, su cumplimiento frente a la meta.
            </p>
          </div>
          <Select value={owner} onValueChange={(v) => { if (v) setOwner(v); }}>
            <SelectTrigger className="w-[200px]" aria-label="Propietario">
              {/* Sin esto, el trigger mostraría el valor centinela en crudo. */}
              <SelectValue>{(v: string | null) => (v === TOTAL ? TOTAL_LABEL : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOTAL}>{TOTAL_LABEL}</SelectItem>
              {(vendedoresQ.data ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-3">
          {cargando ? (
            <Skeleton className="h-full min-h-[420px] w-full" />
          ) : sinDatos ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Sin datos.</p>
          ) : (
            <>
              {sinMetas && (
                <p className="text-xs text-muted-foreground">
                  Configura las metas de {ambito} para {year} en{" "}
                  {profile?.role === "admin"
                    ? <Link href="/settings" className="underline hover:text-primary">Configuración</Link>
                    : "Configuración"}
                  . Sin metas se enseñan los valores, pero no el cumplimiento.
                </p>
              )}
              <div className={`overflow-auto ${refrescando ? "opacity-60 transition-opacity" : ""}`}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="sticky left-0 z-10 bg-card py-1.5 pr-3 text-left font-medium text-muted-foreground min-w-[240px]">KPI</th>
                      {MONTHS.map((m) => (
                        <th key={m.value} className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[72px]">{m.label}</th>
                      ))}
                      <th className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[80px]">Promedio</th>
                      <th className="px-1.5 py-1.5 text-right font-medium text-muted-foreground min-w-[72px]">Aporte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => {
                      // Solo ventas y generación de tratos, nuevos y existentes, tienen
                      // fila a fila que desglosar; el resto de KPIs son agregados.
                      const origen = breakdownSourceFor(f.def.key, mensualesBreakdown, tratosBreakdown);
                      return (
                        <tr key={f.def.key} className="border-b border-white/5">
                          <td className="sticky left-0 z-10 bg-card py-2 pr-3 align-top">
                            <div className="font-medium">{f.def.label}</div>
                            <div className="text-muted-foreground">
                              {conMayuscula(f.def.period)} · {KPI_UNIT_LABEL[f.def.unit]}
                              {f.peso > 0 ? ` · peso ${formatPct(f.peso)}` : ""}
                            </div>
                            {f.def.pendingReason && (
                              <div className="text-muted-foreground">{f.def.pendingReason}</div>
                            )}
                            {f.def.key === "incremento_st" && (
                              <div className="text-muted-foreground">De compañía: no se filtra por comercial.</div>
                            )}
                          </td>
                          {f.meses.map((v, i) => (
                            <td key={MONTHS[i].value} className="px-1.5 py-2 text-right tabular-nums align-top">
                              {origen !== null && v !== null && v > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setCelda({ def: f.def, mesIndex: i, rows: origen.rows, serie: origen.serie })}
                                  className="underline decoration-dotted underline-offset-2 hover:text-primary hover:decoration-solid"
                                >
                                  {formatValor(v, f.def.unit)}
                                </button>
                              ) : (
                                <div className={v === null ? "text-muted-foreground" : ""}>
                                  {v === null ? "—" : formatValor(v, f.def.unit)}
                                </div>
                              )}
                              {f.cierres[i] !== null && (
                                <div className="text-muted-foreground">{formatPct(f.cierres[i] as number)}</div>
                              )}
                            </td>
                          ))}
                          <td className="px-1.5 py-2 text-right tabular-nums align-top">
                            {f.promedio === null ? "—" : formatPct(f.promedio)}
                          </td>
                          <td className="px-1.5 py-2 text-right tabular-nums align-top">
                            {f.aporte === null ? "—" : formatPct(f.aporte)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10">
                      <td className="sticky left-0 z-10 bg-card py-2 pr-3 align-top">
                        <span className="font-semibold">TOTAL</span>
                        <span className="block text-muted-foreground">
                          cobertura: {formatPct(marcador.coverage)} del peso
                        </span>
                      </td>
                      <td colSpan={MESES} />
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums align-top">
                        {marcador.total === null ? "—" : formatPct(marcador.total)}
                      </td>
                      <td className="px-1.5 py-2 text-right font-semibold tabular-nums align-top">
                        {formatPct(aporteTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={celda !== null} onOpenChange={(open) => { if (!open) setCelda(null); }}>
        <DialogContent className="max-h-[70vh] overflow-auto sm:max-w-md">
          {celda && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {celda.def.label} · {MONTHS[celda.mesIndex].full} {year}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">{ambito} · {tipoRegistroLabel}</p>
              </DialogHeader>
              {detalle.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Sin clientes que desglosar en {MONTHS[celda.mesIndex].full.toLowerCase()}.
                </p>
              ) : (
                <>
                  <ul className="max-h-72 space-y-1 overflow-auto">
                    {detalle.map((r) => (
                      <li key={r.nombre} className="flex items-center justify-between gap-3">
                        {detalleEnlaza ? (
                          <Link href={customerHref(r.nombre)} className="truncate hover:text-primary hover:underline">
                            {r.nombre}
                          </Link>
                        ) : (
                          <span className="truncate">{r.nombre}</span>
                        )}
                        <span className="shrink-0 tabular-nums">{formatValor(r.valor, celda.def.unit)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t border-border/40 pt-2 font-semibold">
                    <span>{detalle.length} {detalle.length === 1 ? "cliente" : "clientes"}</span>
                    <span className="tabular-nums">Total: {formatValor(detalleTotal, celda.def.unit)}</span>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
