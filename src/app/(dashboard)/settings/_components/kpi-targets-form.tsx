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
import {
  COMMERCIAL_KPIS, KPI_CON_PLAZO, KPI_UNIT_LABEL, getKpiYearRange, puedeEditarMetas,
} from "@/lib/commercial-kpis";
import { evaluarBorrador, hayCambios, plazoInicial, toDraft, type Draft } from "@/lib/kpi-metas";
import { useAuth } from "@/components/providers/auth-provider";
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

// Las columnas de cada fila. La cabecera y los campos comparten la rejilla para que
// caigan alineados. El total lleva una cuarta, el plazo de tickets: ese KPI solo se
// mide a nivel compañía, así que en un vendedor no hay plazo que configurar.
const FILA = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px] sm:items-center";
const FILA_CON_PLAZO = "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_120px_110px] sm:items-center";

/** "mensual" -> "Mensual". Se capitaliza aquí y no con CSS: `capitalize` tocaría
 *  también la unidad y dejaría "nº" como "Nº". */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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
  editable,
  onSaved,
}: {
  year: number;
  salesperson: KpiScope;
  rows: KpiTargetRow[];
  editable: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [edits, setEdits] = useState<Draft>({});
  // null = sin tocar: se ve lo guardado o el plazo por defecto, igual que con `edits`.
  const [plazoEditado, setPlazoEditado] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const guardados = useMemo(() => toDraft(rows), [rows]);
  const draft = useMemo(() => ({ ...guardados, ...edits }), [guardados, edits]);
  const esTotal = salesperson === null;
  const fila = esTotal ? FILA_CON_PLAZO : FILA;
  const plazoTexto = plazoEditado ?? plazoInicial(rows);

  const editar = (key: string, campo: "target" | "weight", valor: string) => {
    setEdits((prev) => {
      const actual = prev[key] ?? guardados[key] ?? { target: "", weight: "" };
      return { ...prev, [key]: { ...actual, [campo]: valor } };
    });
  };

  // Qué se envía y si se puede guardar sale de una función pura con tests: aquí solo se pinta.
  const { items: enviados, suma, pesosValidos, valido, avisoPlazo } = useMemo(
    () => evaluarBorrador(draft, salesperson, plazoTexto),
    [draft, salesperson, plazoTexto]
  );
  const cambiado = useMemo(
    () => hayCambios(rows, draft, salesperson, plazoTexto),
    [rows, draft, salesperson, plazoTexto]
  );

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await saveKpiTargets(year, salesperson, enviados);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Metas guardadas");
      // Se espera la recarga antes de soltar lo tecleado: si no, el campo enseñaría un
      // instante el plazo guardado antes, ya obsoleto.
      await onSaved();
      // El campo vuelve a enseñar lo guardado: si la fila de tickets se ha quitado, su
      // plazo se fue con ella y lo honesto es ver el de por defecto.
      setPlazoEditado(null);
      // Lo tecleado ya es lo guardado: se suelta para que la pantalla muestre la base
      // y el botón se apague hasta el siguiente cambio.
      setEdits({});
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
        <div className={`${fila} hidden sm:grid px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground`}>
          <span>KPI</span>
          <span>Meta</span>
          <span>Peso %</span>
          {esTotal && <span>Plazo (h)</span>}
        </div>
        {COMMERCIAL_KPIS.map((k) => (
          <div key={k.key} className={fila}>
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
              readOnly={!editable}
              value={draft[k.key]?.target ?? ""}
              onChange={(e) => editar(k.key, "target", e.target.value)}
            />
            <Input
              aria-label={`Peso de ${k.label}`}
              placeholder="%"
              inputMode="decimal"
              readOnly={!editable}
              value={draft[k.key]?.weight ?? ""}
              onChange={(e) => editar(k.key, "weight", e.target.value)}
            />
            {/* Horas laborables: menos de este plazo cuenta como en plazo. */}
            {esTotal && k.key === KPI_CON_PLAZO && (
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Plazo de ${k.label}`}
                  placeholder="h"
                  inputMode="decimal"
                  readOnly={!editable}
                  value={plazoTexto}
                  onChange={(e) => setPlazoEditado(e.target.value)}
                />
                {/* En móvil no hay cabecera y el campo siempre lleva valor, así que el
                    marcador «h» nunca se ve: sin este sufijo, «12» no diría qué es. En
                    escritorio ya lo dice la cabecera «Plazo (h)». */}
                <span aria-hidden="true" className="text-xs text-muted-foreground sm:hidden">h laborables</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* El lector solo consulta: sin botón, y los avisos en rojo no le servirían de nada. */}
      {editable && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          {avisoPlazo && <p className="text-sm text-destructive">{avisoPlazo}</p>}
          <div className="flex items-center justify-between gap-4">
            <span className={pesosValidos ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
              Suma de pesos: {Math.round(suma * 100) / 100}%
            </span>
            <Button onClick={guardar} disabled={!valido || !cambiado || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar metas
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export function KpiTargetsForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [scope, setScope] = useState<string>(TOTAL);

  // Todo usuario aprobado ve las metas; editarlas depende del rol. El servidor
  // aplica la misma regla, esto solo evita ofrecer lo que luego rechazaría.
  const conPerfil = !!profile;
  const editable = puedeEditarMetas(profile?.role);
  const salesperson: KpiScope = scope === TOTAL ? null : scope;

  const vendedoresQ = useQuery({
    queryKey: ["kpi-salespeople"],
    queryFn: () => getSalespeople(),
    enabled: conPerfil,
  });

  // `data` sin definir es el estado de carga fiable aquí: mientras la consulta
  // está deshabilitada esperando al perfil, isLoading ya vale false.
  const { data } = useQuery({
    queryKey: ["kpi-targets", year, scope],
    queryFn: () => getKpiTargets(year, salesperson),
    enabled: conPerfil,
  });

  if (!conPerfil) return null;

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold inline-flex items-center gap-2">
            <Target className="size-4 text-primary" /> Metas de KPIs comerciales
          </CardTitle>
          <CardDescription>
            {editable
              ? "Meta y peso de cada KPI para el año y el ámbito elegidos. Solo se guardan los KPIs con peso, y los pesos de cada ámbito deben sumar 100. En el total, el plazo de tickets son horas laborables: menos de ese plazo cuenta como en plazo."
              : "Meta y peso de cada KPI para el año y el ámbito elegidos. Solo lectura."}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={String(year)} onValueChange={(v) => { if (v) setYear(Number(v)); }}>
            <SelectTrigger className="w-[110px]" aria-label="Año"><SelectValue /></SelectTrigger>
            <SelectContent>
              {getKpiYearRange().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
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
            editable={editable}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["kpi-targets", year, scope] })}
          />
        )}
      </CardContent>
    </Card>
  );
}
