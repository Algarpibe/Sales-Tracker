"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Save, Wrench, X } from "lucide-react";
import { getTechServiceCategories, saveTechServiceBuckets } from "@/actions/category-actions";
import { puedeEditarMetas } from "@/lib/commercial-kpis";
import { TECH_SERVICE_CATEGORIES_KEY } from "@/lib/tech-service";
import {
  alternarCategoria,
  grupoDe,
  haCambiado,
  seleccionInicial,
  type SeleccionServicioTecnico,
} from "@/lib/tech-service-selection";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TechServiceBucket, TechServiceCategory } from "@/types/database";

// Nombre corto de cada grupo. Es la nota junto a una categoría que ya está en el
// otro grupo, y el final del nombre accesible del botón de quitar.
const CORTO: Record<TechServiceBucket, string> = { st: "ST", cr: "C&R" };

const GRUPOS: { bucket: TechServiceBucket; titulo: string }[] = [
  { bucket: "st", titulo: "Categorías de ST (mano de obra)" },
  { bucket: "cr", titulo: "Categorías de C&R (consumibles y repuestos)" },
];

/**
 * Un grupo: el desplegable con buscador (solo para quien edita) y las etiquetas de
 * lo marcado. Las etiquetas salen de la selección y no de las categorías activas,
 * para que una inactiva ya clasificada se siga viendo. Si no se viera, desaparecería
 * del grupo al guardar sin que nadie lo hubiera decidido.
 */
function GrupoCategorias({
  bucket,
  titulo,
  seleccion,
  activas,
  porId,
  editable,
  onToggle,
}: {
  bucket: TechServiceBucket;
  titulo: string;
  seleccion: SeleccionServicioTecnico;
  activas: TechServiceCategory[];
  porId: Map<string, TechServiceCategory>;
  editable: boolean;
  onToggle: (id: string) => void;
}) {
  const ids = seleccion[bucket];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{titulo}</p>

      {editable && (
        <Popover>
          <PopoverTrigger
            aria-label={`Elegir ${titulo}`}
            className="inline-flex items-center justify-between w-full px-3 py-2 text-sm bg-black/20 border border-white/10 hover:bg-black/40 transition-all shadow-sm rounded-xl text-foreground cursor-pointer h-10"
          >
            <span className="truncate flex-1 text-left">
              {ids.length === 0 ? "Seleccionar categorías..." : `${ids.length} seleccionadas`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 bg-background/95 backdrop-blur-xl border-white/10 rounded-xl" align="start">
            <Command>
              <CommandInput placeholder="Buscar..." />
              <CommandList>
                <CommandEmpty>No hay resultados.</CommandEmpty>
                <CommandGroup>
                  {activas.map((c) => {
                    const grupo = grupoDe(seleccion, c.id);
                    const marcada = grupo === bucket;
                    // En el otro grupo: se ve, pero desactivada y con la nota de dónde está.
                    const enOtro = grupo !== null && grupo !== bucket;
                    return (
                      <CommandItem
                        key={c.id}
                        value={c.name}
                        disabled={enOtro}
                        onSelect={() => onToggle(c.id)}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border transition-all",
                            marcada
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-white/20 opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="flex-1">{c.name}</span>
                        {enOtro && grupo && (
                          <span className="text-[11px] text-muted-foreground">en {CORTO[grupo]}</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <ul aria-label={titulo} className="flex flex-wrap gap-2">
        {ids.length === 0 && <li className="text-xs text-muted-foreground">Ninguna categoría.</li>}
        {ids.map((id) => {
          const c = porId.get(id);
          if (!c) return null;
          return (
            <li key={id}>
              <Badge variant="secondary" className="gap-1">
                {c.name}
                {!c.is_active && " (inactiva)"}
                {editable && (
                  <button
                    type="button"
                    aria-label={`Quitar ${c.name} de ${CORTO[bucket]}`}
                    onClick={() => onToggle(id)}
                    className="rounded-full hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Los dos grupos y el botón de guardar. El padre lo remonta con `key` cada vez que
 * llegan datos nuevos, así que el estado inicial no necesita un efecto que lo
 * sincronice con lo guardado.
 */
function TechServiceCategoriesFields({
  categorias,
  editable,
  onSaved,
}: {
  categorias: TechServiceCategory[];
  editable: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const inicial = useMemo(() => seleccionInicial(categorias), [categorias]);
  const [seleccion, setSeleccion] = useState<SeleccionServicioTecnico>(inicial);
  const [saving, setSaving] = useState(false);

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  // Los desplegables solo ofrecen las activas: no tiene sentido clasificar ahora una
  // categoría que ya no se usa.
  const activas = useMemo(() => categorias.filter((c) => c.is_active), [categorias]);
  const cambiado = haCambiado(inicial, seleccion);

  const alternar = (bucket: TechServiceBucket, id: string) =>
    setSeleccion((prev) => alternarCategoria(prev, bucket, id));

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await saveTechServiceBuckets(seleccion.st, seleccion.cr);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Clasificación guardada");
      // Se espera la recarga: si «saving» volviera a false antes, el botón se
      // reactivaría un instante comparando contra la selección inicial ya obsoleta.
      await onSaved();
    } catch {
      toast.error("Error de red. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {GRUPOS.map((g) => (
          <GrupoCategorias
            key={g.bucket}
            bucket={g.bucket}
            titulo={g.titulo}
            seleccion={seleccion}
            activas={activas}
            porId={porId}
            editable={editable}
            onToggle={(id) => alternar(g.bucket, id)}
          />
        ))}
      </div>
      {/* El lector solo consulta: sin botón. */}
      {editable && (
        <div className="flex justify-end border-t border-white/10 pt-4">
          <Button onClick={guardar} disabled={!cambiado || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar categorías
          </Button>
        </div>
      )}
    </>
  );
}

export function TechServiceCategoriesForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Todo usuario aprobado ve la clasificación; cambiarla depende del rol, con la misma
  // regla que las metas. El servidor aplica la misma regla: esto solo evita ofrecer
  // algo que luego rechazaría.
  const conPerfil = !!profile;
  const editable = puedeEditarMetas(profile?.role);

  const { data, dataUpdatedAt } = useQuery({
    queryKey: TECH_SERVICE_CATEGORIES_KEY,
    queryFn: () => getTechServiceCategories(),
    enabled: conPerfil,
  });

  if (!conPerfil) return null;

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base font-semibold inline-flex items-center gap-2">
          <Wrench className="size-4 text-primary" /> Categorías de Servicio Técnico
        </CardTitle>
        <CardDescription>
          {editable
            ? "Qué categorías suman como ST (mano de obra) y cuáles como C&R (consumibles y repuestos) en el Análisis de Servicio Técnico y en el KPI de incremento. Una categoría solo puede estar en un grupo."
            : "Qué categorías suman como ST (mano de obra) y cuáles como C&R (consumibles y repuestos) en el Análisis de Servicio Técnico y en el KPI de incremento. Solo lectura."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data === undefined ? (
          <p className="text-sm text-muted-foreground">Cargando categorías…</p>
        ) : (
          <TechServiceCategoriesFields
            key={dataUpdatedAt}
            categorias={data}
            editable={editable}
            // Invalida ["categories"] entero: por prefijo refresca esta consulta, la del
            // gráfico, la del widget y la del KPI, sin recargar la página.
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["categories"] })}
          />
        )}
      </CardContent>
    </Card>
  );
}
