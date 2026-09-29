"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers, Loader2, Save } from "lucide-react";
import { getMacroCategorias, saveMacroCategorias } from "@/actions/category-actions";
import { puedeEditarMetas } from "@/lib/commercial-kpis";
import { BUCKETS, BUCKET_LABELS, MACRO_CATEGORIAS_KEY } from "@/lib/customer-item";
import { alternarCategoria, haCambiado, seleccionPorGrupo, type Seleccion } from "@/lib/seleccion-grupos";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Bucket, MacroCategoria } from "@/types/database";
import { GrupoCategorias } from "./grupo-categorias";

// No debe contener «Categorías de Servicio Técnico»: el E2E de esa tarjeta la busca por
// ese texto y encontraría dos.
const DESCRIPCION =
  "Qué categorías suman en cada macro-categoría en los gráficos de mezcla, en Cliente × Artículo y en sus exportaciones. Lo que no esté marcado cuenta como Equipos. Una categoría solo puede estar en una macro-categoría.";

/**
 * Los cuatro grupos y el botón de guardar. El padre lo remonta con `key` cada vez que
 * llegan datos nuevos, así que el estado inicial no necesita un efecto que lo
 * sincronice con lo guardado.
 */
function MacroCategoriasFields({
  categorias,
  editable,
  onSaved,
}: {
  categorias: MacroCategoria[];
  editable: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const inicial = useMemo(
    () => seleccionPorGrupo(BUCKETS, categorias.map((c) => ({ id: c.id, grupo: c.macro_categoria }))),
    [categorias]
  );
  const [seleccion, setSeleccion] = useState<Seleccion<Bucket>>(inicial);
  const [saving, setSaving] = useState(false);

  const porId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);
  // Los desplegables solo ofrecen las activas: no tiene sentido clasificar ahora una
  // categoría que ya no se usa. Las inactivas ya marcadas siguen como etiqueta.
  const activas = useMemo(() => categorias.filter((c) => c.is_active), [categorias]);
  const cambiado = haCambiado(inicial, seleccion);

  const alternar = (bucket: Bucket, id: string) =>
    setSeleccion((prev) => alternarCategoria(prev, bucket, id));

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await saveMacroCategorias(seleccion);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Macro-categorías guardadas");
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
        {BUCKETS.map((b) => (
          <GrupoCategorias
            key={b}
            bucket={b}
            titulo={BUCKET_LABELS[b]}
            corto={BUCKET_LABELS}
            seleccion={seleccion}
            activas={activas}
            porId={porId}
            editable={editable}
            onToggle={(id) => alternar(b, id)}
          />
        ))}
      </div>
      {/* El lector solo consulta: sin botón. */}
      {editable && (
        <div className="flex justify-end border-t border-white/10 pt-4">
          <Button onClick={guardar} disabled={!cambiado || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar macro-categorías
          </Button>
        </div>
      )}
    </>
  );
}

export function MacroCategoriasForm() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Todo usuario aprobado ve la clasificación; cambiarla es de Admin y Editor. El
  // servidor aplica la misma regla: esto solo evita ofrecer algo que luego rechazaría.
  const conPerfil = !!profile;
  const editable = puedeEditarMetas(profile?.role);

  const { data, dataUpdatedAt } = useQuery({
    queryKey: MACRO_CATEGORIAS_KEY,
    queryFn: () => getMacroCategorias(),
    enabled: conPerfil,
  });

  if (!conPerfil) return null;

  return (
    <Card className="border-border/40 bg-card/30 backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base font-semibold inline-flex items-center gap-2">
          <Layers className="size-4 text-primary" /> Macro-categorías
        </CardTitle>
        <CardDescription>{editable ? DESCRIPCION : `${DESCRIPCION} Solo lectura.`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data === undefined ? (
          <p className="text-sm text-muted-foreground">Cargando categorías…</p>
        ) : (
          <MacroCategoriasFields
            key={dataUpdatedAt}
            categorias={data}
            editable={editable}
            // Invalida ["categories"] entero: por prefijo refresca esta tarjeta y todos
            // los gráficos que clasifican por macro-categoría, sin recargar la página.
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["categories"] })}
          />
        )}
      </CardContent>
    </Card>
  );
}
