"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Target } from "lucide-react";
import {
  getKpiTargets,
  getSalespeople,
  saveKpiTargets,
  type KpiScope,
  type KpiTargetRow,
} from "@/actions/kpi-actions";
import { COMMERCIAL_KPIS, KPI_UNIT_LABEL } from "@/lib/commercial-kpis";
import { useAuth } from "@/components/providers/auth-provider";
import { getYearRange } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Valor del selector para el total de la compañía: el ámbito real es null, pero
// un Select necesita una cadena.
const TOTAL = "__total__";
const TOTAL_LABEL = "Total compañía";

type Draft = Record<string, { target: string; weight: string }>;

// Las tres columnas de cada fila. La cabecera y los campos comparten la rejilla
// para que caigan alineados.
const FILA = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px] sm:items-center";

/** "mensual" -> "Mensual". Se capitaliza aquí y no con CSS: `capitalize` tocaría
 *  también la unidad y dejaría "nº" como "Nº". */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Lo guardado, como texto editable. Los KPIs sin fila en ese ámbito van vacíos. */
function toDraft(rows: KpiTargetRow[]): Draft {
  const d: Draft = Object.fromEntries(
    COMMERCIAL_KPIS.map((k) => [k.key, { target: "", weight: "" }])
  );
  for (const r of rows) {
    if (d[r.kpi_key]) d[r.kpi_key] = { target: String(r.target_value), weight: String(r.weight_pct) };
  }
  return d;
}

/**
 * Campos de un ámbito ya cargado. El padre lo remonta con `key` al cambiar de año
 * o de ámbito, así que no hace falta un efecto que rehaga el borrador: `edits`
 * guarda solo lo que el usuario teclea y se superpone a lo que hay en la base.
 */
function KpiTargetsFields({
  year,
  salesperson,
  rows,
  onSaved,
}: {
  year: number;
  salesperson: KpiScope;
  rows: KpiTargetRow[];
  onSaved: () => void;
}) {
  const [edits, setEdits] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  const guardados = useMemo(() => toDraft(rows), [rows]);
  const draft = useMemo(() => ({ ...guardados, ...edits }), [guardados, edits]);

  const editar = (key: string, campo: "target" | "weight", valor: string) => {
    setEdits((prev) => {
      const actual = prev[key] ?? guardados[key] ?? { target: "", weight: "" };
      return { ...prev, [key]: { ...actual, [campo]: valor } };
    });
  };

  // Solo cuentan los KPIs con peso: el resto no se mide en ese ámbito.
  const enviados = useMemo(
    () =>
      COMMERCIAL_KPIS.map((k) => ({
        kpi_key: k.key,
        target_value: Number(draft[k.key]?.target ?? ""),
        weight_pct: Number(draft[k.key]?.weight ?? ""),
      })).filter((i) => Number.isFinite(i.weight_pct) && i.weight_pct > 0),
    [draft]
  );
  const suma = useMemo(() => enviados.reduce((s, i) => s + i.weight_pct, 0), [enviados]);
  const valido = Math.round(suma * 100) === 10000 && enviados.every((i) => i.target_value > 0);

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await saveKpiTargets(year, salesperson, enviados);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Metas guardadas");
      onSaved();
    } catch {
      toast.error("Error de red. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        {/* En movil la rejilla se apila y la cabecera no ayudaria: ahi orientan los
            marcadores de cada campo. */}
        <div className={`${FILA} hidden sm:grid px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground`}>
          <span>KPI</span>
          <span>Meta</span>
          <span>Peso %</span>
        </div>
        {COMMERCIAL_KPIS.map((k) => (
          <div key={k.key} className={FILA}>
            <div>
              <div className="text-sm font-medium">{k.label}</div>
              <div className="text-xs text-muted-foreground">
                {conMayuscula(k.period)} · {KPI_UNIT_LABEL[k.unit]}
              </div>
            </div>
            <Input
              aria-label={`Meta de ${k.label}`}
              placeholder={KPI_UNIT_LABEL[k.unit]}
              inputMode="decimal"
              value={draft[k.key]?.target ?? ""}
              onChange={(e) => editar(k.key, "target", e.target.value)}
            />
            <Input
              aria-label={`Peso de ${k.label}`}
              placeholder="%"
              inputMode="decimal"
              value={draft[k.key]?.weight ?? ""}
              onChange={(e) => editar(k.key, "weight", e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4">
        <span className={valido ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          Suma de pesos: {Math.round(suma * 100) / 100}%
        </span>
        <Button onClick={guardar} disabled={!valido || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar metas
        </Button>
      </div>
    </>
  );
}

export function KpiTargetsForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [scope, setScope] = useState<string>(TOTAL);

  const esAdmin = profile?.role === "admin";
  const salesperson: KpiScope = scope === TOTAL ? null : scope;

  const vendedoresQ = useQuery({
    queryKey: ["kpi-salespeople"],
    queryFn: () => getSalespeople(),
    enabled: esAdmin,
  });

  // `data` sin definir es el estado de carga fiable aquí: mientras la consulta
  // está deshabilitada esperando al perfil, isLoading ya vale false.
  const { data } = useQuery({
    queryKey: ["kpi-targets", year, scope],
    queryFn: () => getKpiTargets(year, salesperson),
    enabled: esAdmin,
  });

  if (!esAdmin) return null;

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold inline-flex items-center gap-2">
            <Target className="size-4 text-primary" /> Metas de KPIs comerciales
          </CardTitle>
          <CardDescription>
            Meta y peso de cada KPI para el año y el ámbito elegidos. Solo se guardan los KPIs con peso, y los pesos de cada ámbito deben sumar 100.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
            <SelectTrigger className="w-[110px]" aria-label="Año"><SelectValue /></SelectTrigger>
            <SelectContent>
              {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={(v) => { if (v) setScope(v); }}>
            <SelectTrigger className="w-[200px]" aria-label="Ámbito">
              {/* Sin esto, el trigger mostraría el valor centinela en crudo. */}
              <SelectValue>{(v: string | null) => (v === TOTAL ? TOTAL_LABEL : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOTAL}>{TOTAL_LABEL}</SelectItem>
              {(vendedoresQ.data ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data === undefined ? (
          <p className="text-sm text-muted-foreground">Cargando metas…</p>
        ) : (
          <KpiTargetsFields
            key={`${year}|${scope}`}
            year={year}
            salesperson={salesperson}
            rows={data}
            onSaved={() => { queryClient.invalidateQueries({ queryKey: ["kpi-targets", year, scope] }); }}
          />
        )}
      </CardContent>
    </Card>
  );
}
