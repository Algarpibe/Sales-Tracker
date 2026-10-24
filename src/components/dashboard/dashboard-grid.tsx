"use client";

import { useEffect, useMemo, useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Pencil, Save, RotateCcw, XCircle } from "lucide-react";

import { saveDashboardLayout, resetDashboardLayout } from "@/actions/dashboard-layout-actions";
import { fetchDashboardLayout } from "@/lib/data-client";
import { DEFAULT_LAYOUT, type DashboardItem } from "@/lib/dashboard-layout";
import { WIDGET_MAP, type WidgetContext } from "@/lib/widget-registry";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { usePeriod } from "@/components/providers/period-provider";
import { WidgetFrame } from "@/components/dashboard/widget-frame";
import { WidgetPicker } from "@/components/dashboard/widget-picker";
import { unwrapAction, userErrorMessage } from "@/lib/errors";

// Tras mover o redimensionar, recharts necesita un evento de resize para remedirse.
function pokeResize() {
  window.dispatchEvent(new Event("resize"));
}

export function DashboardGrid() {
  const { width, containerRef, mounted } = useContainerWidth();
  const qc = useQueryClient();
  const data = useDashboardData();
  const { tipo } = usePeriod();

  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<DashboardItem[] | null>(null);
  const [backup, setBackup] = useState<DashboardItem[] | null>(null);

  const layoutQ = useQuery({ queryKey: ["dashboard-layout"], queryFn: fetchDashboardLayout });

  // Carga inicial: layout guardado o el por defecto. El setState aquí es
  // intencional (hidrata el layout persistido una sola vez, cuando la query
  // resuelve). Excepción explícita a set-state-in-effect, que es error (FE-008).
  useEffect(() => {
    if (items === null && !layoutQ.isLoading) {
      // `null` = el usuario nunca personalizó → por defecto. Un array vacío es una
      // elección válida (dashboard sin tarjetas) y debe respetarse.
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setItems(layoutQ.data ?? DEFAULT_LAYOUT);
    }
  }, [layoutQ.data, layoutQ.isLoading, items]);

  // Se sale del modo edición sólo si la persistencia tuvo éxito: si falla, el
  // usuario conserva sus cambios en pantalla y puede reintentar.
  const saveMut = useMutation({
    // runAction devuelve { ok: false } en vez de lanzar (ARQ-077): unwrapAction lo
    // convierte en error para que useMutation vaya a onError.
    mutationFn: async (next: DashboardItem[]) => unwrapAction(await saveDashboardLayout(next)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-layout"] });
      setEditing(false);
      setBackup(null);
      toast.success("Dashboard guardado");
    },
    onError: (e) => toast.error(userErrorMessage(e, "No se pudo guardar el dashboard")),
  });
  const resetMut = useMutation({
    mutationFn: async () => unwrapAction(await resetDashboardLayout()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-layout"] });
      setItems(DEFAULT_LAYOUT);
      setEditing(false);
      setBackup(null);
      setConfirmReset(false);
      toast.success("Dashboard restablecido");
    },
    onError: (e) => toast.error(userErrorMessage(e, "No se pudo restablecer")),
  });
  // Restablecer borra el layout guardado: se confirma antes.
  const [confirmReset, setConfirmReset] = useState(false);

  const ctx: WidgetContext = useMemo(() => ({
    recordType: tipo as "SALES_ORDER" | "INVOICE",
    year: data.year,
    records: data.records,
    prevRecords: data.prevRecords,
    catMap: data.catMap,
    categories: data.categories,
    metrics: data.metrics,
    metricsPrev: data.metricsPrev,
  }), [tipo, data]);

  const rglLayout: Layout = useMemo(
    () => (items ?? []).map((it) => {
      const def = WIDGET_MAP.get(it.id);
      return { i: it.id, x: it.x, y: it.y, w: it.w, h: it.h, minW: def?.minSize.w, minH: def?.minSize.h };
    }),
    [items]
  );

  // OJO: no se puede hacer early-return aquí. `useContainerWidth` sólo engancha su
  // ResizeObserver si el nodo del ref existe cuando corre su efecto; si durante la
  // carga no renderizamos el contenedor, el ancho se queda en el valor inicial
  // (1280) y la rejilla aparece estrecha y desplazada. El contenedor va siempre.
  const loading = !items || data.isLoading;

  const startEdit = () => { setBackup(items); setEditing(true); };
  const cancelEdit = () => { if (backup) setItems(backup); setBackup(null); setEditing(false); };
  const save = () => { if (items) saveMut.mutate(items); }; // sale de edición en onSuccess

  const addWidget = (id: string) => {
    const def = WIDGET_MAP.get(id);
    if (!items || !def || items.some((i) => i.id === id)) return;
    const maxY = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
    setItems([...items, { id, x: 0, y: maxY, w: def.defaultSize.w, h: def.defaultSize.h }]);
  };
  const removeWidget = (id: string) => setItems((prev) => (prev ?? []).filter((i) => i.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {loading ? null : editing ? (
          <>
            <WidgetPicker presentIds={new Set((items ?? []).map((i) => i.id))} onAdd={addWidget} />
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="mr-2 h-4 w-4" /> Restablecer
            </Button>
            <Button variant="outline" size="sm" onClick={cancelEdit}>
              <XCircle className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button size="sm" onClick={save}>
              <Save className="mr-2 h-4 w-4" /> Guardar
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="mr-2 h-4 w-4" /> Personalizar
          </Button>
        )}
      </div>

      {/* Este contenedor debe montarse SIEMPRE (ver nota sobre useContainerWidth). */}
      <div ref={containerRef} className="w-full">
        {loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : mounted && (
          <ReactGridLayout
            layout={rglLayout}
            width={width}
            gridConfig={{ cols: 12, rowHeight: 40, margin: [16, 16] }}
            dragConfig={{ enabled: editing, handle: ".widget-drag-handle" }}
            resizeConfig={{ enabled: editing }}
            onLayoutChange={(l) => {
              if (!editing) return;
              setItems((prev) => (prev ?? []).map((it) => {
                const p = l.find((x) => x.i === it.id);
                return p ? { ...it, x: p.x, y: p.y, w: p.w, h: p.h } : it;
              }));
            }}
            onResizeStop={pokeResize}
            onDragStop={pokeResize}
          >
            {(items ?? []).map((it) => {
              const def = WIDGET_MAP.get(it.id);
              if (!def) return <div key={it.id} />;
              return (
                <div key={it.id}>
                  <WidgetFrame title={def.title} editing={editing} onRemove={() => removeWidget(it.id)} resetKeys={[ctx.recordType, ctx.year]}>
                    {def.render(ctx)}
                  </WidgetFrame>
                </div>
              );
            })}
          </ReactGridLayout>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="¿Restablecer el dashboard?"
        description="Se borrará tu disposición personalizada y volverán las tarjetas por defecto."
        confirmLabel="Restablecer"
        onConfirm={() => resetMut.mutate()}
        pending={resetMut.isPending}
      />
    </div>
  );
}
