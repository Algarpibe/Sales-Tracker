"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCategories } from "@/actions/category-actions";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import {
  addProjectOrder,
  getKpiDealsMonthly,
  getKpiMonthlySales,
  getKpiProjectOrders,
  getKpiTargets,
  getKpiTicketsChanges,
  getKpiWonDealsMonthly,
  getSalespeople,
  removeProjectOrder,
  searchSalesOrdersForProjects,
  type KpiScope,
  type KpiTargetRow,
} from "@/actions/kpi-actions";
import { getSalesData } from "@/actions/sales-actions";
import { firstYearByCustomer } from "@/lib/analytics-comercial";
import { COMMERCIAL_KPIS, KPI_UNIT_LABEL, type KpiDef, type KpiUnit } from "@/lib/commercial-kpis";
import {
  attainment, esTratoDeClienteNuevo, esVentaDeClienteNuevo, kpiAverage, kpiContribution,
  monthBreakdown, ofYear, periodTotals, valorAlCierre, scoreboard, splitDealsNewExisting, splitNewExisting, sumByMonth, toMonthlySeries,
  type BreakdownInput,
} from "@/lib/kpi-score";
import { customerHref } from "@/lib/customer-detail";
import { detalleTicketsMes, episodiosNotificacionComercial, ticketsEnPlazoPorMes } from "@/lib/kpi-tickets";
import { stGrowthByQuarter } from "@/lib/tech-service";
import { CHART_HELP } from "@/lib/chart-help";
import { MONTHS, RECORD_TYPES, formatPct, formatUSD } from "@/lib/constants";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/common/info-tooltip";
import { TicketsDetalleDialog } from "@/components/charts/comercial/tickets-detalle-dialog";
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

/** KPIs que no se pueden filtrar por comercial: el Servicio Técnico no lleva
 *  comercial en sus líneas, y Desk no asigna comercial al ticket. Con un comercial
 *  elegido enseñan la cifra de compañía, y la fila lo dice. */
const KPIS_DE_COMPANIA = new Set(["incremento_st", "tickets_st"]);

/** Aspecto de una cifra de mes que abre un detalle. Compartido por ventas, tratos y
 *  tickets para que todas las celdas pulsables se vean igual. */
const CLASE_CELDA_PULSABLE =
  "underline decoration-dotted underline-offset-2 hover:text-primary hover:decoration-solid";

/** Orden de venta con su importe neto calculado en vivo, tal y como la devuelven
 *  searchSalesOrdersForProjects y getKpiProjectOrders. Se deriva del tipo real de
 *  la acción en vez de importar HubOrderRow desde src/db/hub-kpi (server-only). */
type OrdenProyecto = Awaited<ReturnType<typeof getKpiProjectOrders>>[number];

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
  /** Cumplimiento que puntúa en el TOTAL. Coincide con `promedio` salvo en el
   *  incremento de Servicio Técnico, cuya columna enseña el incremento en sí. */
  logro: number | null;
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
    logro: promedio,
    peso,
    aporte: promedio === null || peso <= 0 ? null : kpiContribution(promedio, peso),
  };
}

/**
 * Fila del incremento de Servicio Técnico. Es una variación acumulada, así que no
 * se promedia: la columna Promedio enseña el valor del trimestre en curso, y bajo
 * cada trimestre no se pinta el cumplimiento (el incremento dividido por la meta,
 * que multiplicaba la cifra y confundía). El aporte sí compara ese valor con la
 * meta, igual que el resto de filas, para que el TOTAL siga midiendo cumplimiento.
 */
function construirFilaIncremento(
  def: KpiDef,
  trimestres: (number | null)[],
  meta: KpiTargetRow | undefined,
  alCierre: number | null
): FilaKpi {
  const paso = MESES / trimestres.length;
  const meses: (number | null)[] = new Array(MESES).fill(null);
  for (const [i, valor] of trimestres.entries()) meses[(i + 1) * paso - 1] = valor;
  const logro = alCierre === null ? null : attainment(alCierre, meta?.target_value ?? 0);
  const peso = meta?.weight_pct ?? 0;
  return {
    def,
    meses,
    cierres: new Array(MESES).fill(null),
    promedio: alCierre,
    logro,
    peso,
    aporte: logro === null || peso <= 0 ? null : kpiContribution(logro, peso),
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
  tratosBreakdown: BreakdownInput[],
  ganadosBreakdown: BreakdownInput[]
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
    case "tratos_ganados":
      return { rows: ganadosBreakdown, serie: "nuevos" };
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
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [owner, setOwner] = useState<string>(TOTAL);
  const salesperson: KpiScope = owner === TOTAL ? null : owner;
  const [celda, setCelda] = useState<CeldaSeleccionada | null>(null);
  // Celda de tickets pulsada (mes 1-12). Va aparte de `celda`: su detalle es una fila
  // por episodio, no clientes con importes, y lo pinta otro diálogo.
  const [celdaTickets, setCeldaTickets] = useState<{ mes: number } | null>(null);
  // Diálogo de gestión de ingresos por proyectos: distinto del de detalle por
  // celda de arriba (`celda`/`setCelda`), que es de solo lectura. Este se abre
  // desde la cabecera de la fila y permite marcar y desmarcar órdenes.
  const [gestionandoProyectos, setGestionandoProyectos] = useState(false);
  const [busquedaProyectos, setBusquedaProyectos] = useState("");
  // hub_order_id de la orden con una acción (agregar/quitar) en curso, para
  // deshabilitar su botón y evitar un doble clic mientras responde el servidor.
  const [pendienteProyecto, setPendienteProyecto] = useState<string | null>(null);

  const vendedoresQ = useQuery({
    queryKey: ["kpi-salespeople"],
    queryFn: () => getSalespeople(),
  });

  // Órdenes marcadas como ingresos de proyecto: no depende de año ni de ámbito,
  // son las que hay, punto. Misma clave que invalidan agregar/quitar, así que el
  // diálogo y la fila de la tabla comparten caché y se refrescan juntos.
  const proyectosQ = useQuery({
    queryKey: ["kpi-project-orders"],
    queryFn: () => getKpiProjectOrders(),
  });
  // Búsqueda del diálogo de gestión: solo se lanza con el diálogo abierto y al
  // menos 2 caracteres, mismo umbral que ya aplica searchSalesOrdersForProjects
  // en el servidor.
  const busquedaHabilitada = gestionandoProyectos && busquedaProyectos.trim().length >= 2;
  const busquedaProyectosQ = useQuery({
    queryKey: ["kpi-project-orders-search", year, busquedaProyectos.trim()],
    queryFn: () => searchSalesOrdersForProjects(busquedaProyectos.trim(), year),
    enabled: busquedaHabilitada,
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
  // Los ganados van aparte de los generados: se cuentan por el mes (en hora de Bogota)
  // en que el trato entro en la fase ganadora, filtrando por ella, asi que no se pueden
  // deducir de los de arriba.
  const ganadosQ = useQuery({
    queryKey: ["kpi-won-deals", year, owner],
    queryFn: () => getKpiWonDealsMonthly(year, salesperson),
    placeholderData: keepPreviousData,
  });
  // Tickets en plazo: de compañía y sin conmutador OV/FAC (Desk no tiene tal cosa),
  // así que la clave solo lleva el año. keepPreviousData como las demás consultas del
  // año: cambiar de año no debe desmontar la tabla entera.
  const ticketsQ = useQuery({
    queryKey: ["kpi-tickets", year],
    queryFn: () => getKpiTicketsChanges(year),
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
  // Los episodios solo dependen de los cambios leídos: no se recalculan al cambiar de
  // comercial ni de OV/FAC.
  const episodiosTickets = useMemo(
    () => episodiosNotificacionComercial(ticketsQ.data ?? []),
    [ticketsQ.data]
  );
  const historico = useMemo(() => historicoQ.data ?? [], [historicoQ.data]);
  const registros = useMemo<SalesRecord[]>(() => ventasQ.data ?? [], [ventasQ.data]);
  const categorias = useMemo<Category[]>(() => (categoriasQ.data as Category[]) ?? [], [categoriasQ.data]);
  const ordenesProyecto = useMemo<OrdenProyecto[]>(() => proyectosQ.data ?? [], [proyectosQ.data]);
  // Solo las del año seleccionado: alimentan la fila y la lista del diálogo, así
  // que las dos enseñan exactamente lo mismo.
  const ordenesProyectoAnio = useMemo(() => ofYear(ordenesProyecto, year), [ordenesProyecto, year]);
  // Ids ya marcados: el buscador los muestra, pero no deja volver a agregarlos.
  const idsProyectoMarcados = useMemo(
    () => new Set(ordenesProyecto.map((o) => o.hub_order_id)),
    [ordenesProyecto]
  );

  const { filas, mensualesBreakdown, tratosBreakdown, ganadosBreakdown, ahoraTickets } = useMemo(() => {
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
    // tratos_ganados no reparte nuevo/existente: es una sola serie. nuevo: true es
    // una convencion, no un cliente nuevo de verdad, para poder reutilizar
    // monthBreakdown pidiendo siempre la serie "nuevos" y que devuelva todas las filas.
    const ganadosBreakdown: BreakdownInput[] = ganados.map((r) => ({
      nombre: r.account_name,
      mes: r.mes,
      valor: r.tratos,
      nuevo: true,
    }));

    // Un solo instante para la fila de tickets y su detalle: si el detalle calculara el
    // suyo al pulsar, un episodio abierto que cruzara las 12 horas entre medias haría que
    // el pie dijera otra cosa que la celda.
    const ahoraTickets = new Date().getTime();

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
      if (def.key === "incremento_st") {
        return construirFilaIncremento(def, st, meta, valorAlCierre(st, year, new Date()));
      }
      if (def.key === "tickets_st") {
        // El porcentaje ya viene por mes: son los doce periodos de una fila mensual y
        // no hay serie aparte, así que construirFila lo pinta en su mes con el
        // cumplimiento debajo. `ahora` decide qué episodios abiertos ya están fuera de
        // plazo; new Date() como en el incremento de arriba.
        return construirFila(def, ticketsEnPlazoPorMes(episodiosTickets, year, ahoraTickets), meta, null);
      }
      if (def.key === "ingresos_proyectos") {
        // date es un `date` de Postgres ('YYYY-MM-DD'), sin hora ni zona: se lee
        // el mes con slice, nunca con new Date(...).getMonth(), que reinterpreta
        // la fecha en la zona horaria local y puede desplazarla de mes.
        const serie = sumByMonth(
          ordenesProyectoAnio.map((o) => ({ mes: Number(o.date.slice(5, 7)), importe: o.importe }))
        );
        return construirFila(def, periodTotals(serie, def.period), meta, serie);
      }
      return construirFila(def, new Array(cubosDe(def)).fill(null), meta, null);
    });

    return { filas, mensualesBreakdown, tratosBreakdown, ganadosBreakdown, ahoraTickets };
  }, [metas, mensuales, tratos, ganados, historico, registros, categorias, ordenesProyectoAnio, episodiosTickets, recordType, year]);

  const marcador = useMemo(
    () => scoreboard(filas.map((f) => ({ average: f.logro, weight: f.peso }))),
    [filas]
  );
  const aporteTotal = useMemo(() => filas.reduce((s, f) => s + (f.aporte ?? 0), 0), [filas]);

  const cargando =
    metasQ.isPending || mensualesQ.isPending || tratosQ.isPending || ganadosQ.isPending ||
    historicoQ.isPending || ventasQ.isPending || categoriasQ.isPending || proyectosQ.isPending ||
    ticketsQ.isPending;
  const refrescando =
    metasQ.isPlaceholderData || mensualesQ.isPlaceholderData || tratosQ.isPlaceholderData ||
    ganadosQ.isPlaceholderData || ticketsQ.isPlaceholderData;
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
  // Mismos episodios, mismo año y mismo `ahora` que la fila: el detalle sale de la misma
  // clasificación que la cifra pulsada.
  const detalleTickets = celdaTickets
    ? detalleTicketsMes(episodiosTickets, year, celdaTickets.mes, ahoraTickets)
    : null;

  // Agregar y quitar comparten la misma invalidación: ["kpi-project-orders"]
  // alimenta a la vez la lista de marcadas del diálogo y la fila de la tabla,
  // así que una sola clave refresca las dos cosas.
  const handleAgregarProyecto = async (hubOrderId: string) => {
    setPendienteProyecto(hubOrderId);
    try {
      const res = await addProjectOrder(hubOrderId);
      if (!res.ok) { toast.error(res.error); return; }
      queryClient.invalidateQueries({ queryKey: ["kpi-project-orders"] });
    } catch {
      toast.error("Error de red. Inténtalo de nuevo.");
    } finally {
      setPendienteProyecto(null);
    }
  };

  const handleQuitarProyecto = async (hubOrderId: string) => {
    setPendienteProyecto(hubOrderId);
    try {
      const res = await removeProjectOrder(hubOrderId);
      if (!res.ok) { toast.error(res.error); return; }
      queryClient.invalidateQueries({ queryKey: ["kpi-project-orders"] });
    } catch {
      toast.error("Error de red. Inténtalo de nuevo.");
    } finally {
      setPendienteProyecto(null);
    }
  };

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
                      const origen = breakdownSourceFor(f.def.key, mensualesBreakdown, tratosBreakdown, ganadosBreakdown);
                      return (
                        <tr key={f.def.key} className="border-b border-white/5">
                          <td className="sticky left-0 z-10 bg-card py-2 pr-3 align-top">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{f.def.label}</div>
                              {f.def.key === "ingresos_proyectos" && profile?.role === "admin" && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => setGestionandoProyectos(true)}
                                >
                                  Gestionar
                                </Button>
                              )}
                            </div>
                            <div className="text-muted-foreground">
                              {conMayuscula(f.def.period)} · {KPI_UNIT_LABEL[f.def.unit]}
                              {f.peso > 0 ? ` · peso ${formatPct(f.peso)}` : ""}
                            </div>
                            {f.def.pendingReason && (
                              <div className="text-muted-foreground">{f.def.pendingReason}</div>
                            )}
                            {KPIS_DE_COMPANIA.has(f.def.key) && (
                              <div className="text-muted-foreground">De compañía: no se filtra por comercial.</div>
                            )}
                          </td>
                          {f.meses.map((v, i) => (
                            <td key={MONTHS[i].value} className="px-1.5 py-2 text-right tabular-nums align-top">
                              {origen !== null && v !== null && v > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setCelda({ def: f.def, mesIndex: i, rows: origen.rows, serie: origen.serie })}
                                  className={CLASE_CELDA_PULSABLE}
                                >
                                  {formatValor(v, f.def.unit)}
                                </button>
                              ) : f.def.key === "tickets_st" && v !== null ? (
                                // v !== null y no v > 0: un 0,0 % tiene episodios (todos
                                // fuera de plazo) y es justo el que más pide explicación.
                                // «—» es un mes sin nada que contar y no abre nada.
                                <button
                                  type="button"
                                  onClick={() => setCeldaTickets({ mes: i + 1 })}
                                  // Sin etiqueta, un lector de pantalla solo anunciaría "60.0%",
                                  // sin decir de qué fila ni de qué mes es.
                                  aria-label={`Detalle de ${f.def.label}, ${MONTHS[i].full}`}
                                  className={CLASE_CELDA_PULSABLE}
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
      <TicketsDetalleDialog
        abierto={celdaTickets !== null}
        onCerrar={() => setCeldaTickets(null)}
        anio={year}
        mes={celdaTickets?.mes ?? 1}
        detalle={detalleTickets}
      />
      <Dialog
        open={gestionandoProyectos}
        onOpenChange={(open) => {
          setGestionandoProyectos(open);
          if (!open) setBusquedaProyectos("");
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestionar ingresos por proyectos</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Marca las órdenes de venta que son ingresos de proyecto. El importe de cada una se
              calcula siempre en vivo contra el hub, nunca se guarda aquí.
            </p>
          </DialogHeader>

          <Command shouldFilter={false} className="rounded-lg border border-border/40">
            <CommandInput
              value={busquedaProyectos}
              onValueChange={setBusquedaProyectos}
              placeholder="Buscar por cliente u orden..."
            />
            <CommandList>
              {busquedaProyectos.trim().length < 2 ? (
                <CommandEmpty>Escribe al menos 2 caracteres para buscar.</CommandEmpty>
              ) : busquedaProyectosQ.isPending ? (
                <CommandEmpty>Buscando…</CommandEmpty>
              ) : (busquedaProyectosQ.data ?? []).length === 0 ? (
                <CommandEmpty>Sin resultados.</CommandEmpty>
              ) : (
                (busquedaProyectosQ.data ?? []).map((orden) => {
                  const yaMarcada = idsProyectoMarcados.has(orden.hub_order_id);
                  return (
                  <CommandItem
                    key={orden.hub_order_id}
                    value={orden.hub_order_id}
                    onSelect={() => { if (!yaMarcada) handleAgregarProyecto(orden.hub_order_id); }}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {orden.customer_name} · {orden.date} · {formatUSD(orden.importe)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={yaMarcada || pendienteProyecto === orden.hub_order_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!yaMarcada) handleAgregarProyecto(orden.hub_order_id);
                      }}
                    >
                      {yaMarcada ? "Agregada" : "Agregar"}
                    </Button>
                  </CommandItem>
                  );
                })
              )}
            </CommandList>
          </Command>

          <div className="space-y-2 border-t border-border/40 pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              Órdenes marcadas en {year} ({ordenesProyectoAnio.length})
            </p>
            {proyectosQ.isPending ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : ordenesProyectoAnio.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguna orden marcada todavía.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-auto">
                {ordenesProyectoAnio.map((orden) => (
                  <li key={orden.hub_order_id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">
                      {orden.customer_name} · {orden.date} · {formatUSD(orden.importe)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={pendienteProyecto === orden.hub_order_id}
                      onClick={() => handleQuitarProyecto(orden.hub_order_id)}
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setGestionandoProyectos(false);
                setBusquedaProyectos("");
              }}
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
