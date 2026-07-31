"use client";

import { useEffect, useMemo, useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Save, RotateCcw, XCircle } from "lucide-react";

import { getDashboardLayout, saveDashboardLayout, resetDashboardLayout } from "@/actions/dashboard-layout-actions";
import { DEFAULT_LAYOUT, type DashboardItem } from "@/lib/dashboard-layout";
import { WIDGET_MAP, type WidgetContext } from "@/lib/widget-registry";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { usePeriod } from "@/components/providers/period-provider";
import { WidgetFrame } from "@/components/dashboard/widget-frame";
import { WidgetPicker } from "@/components/dashboard/widget-picker";

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

  const layoutQ = useQuery({ queryKey: ["dashboard-layout"], queryFn: getDashboardLayout });

  // Carga inicial: layout guardado o el por defecto. El setState aquí es
  // intencional (hidrata el layout persistido una sola vez, cuando la query
  // resuelve); mismo criterio que period-provider.tsx.
  useEffect(() => {
    if (items === null && !layoutQ.isLoading) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setItems(layoutQ.data && layoutQ.data.length > 0 ? layoutQ.data : DEFAULT_LAYOUT);
    }
  }, [layoutQ.data, layoutQ.isLoading, items]);

  const saveMut = useMutation({
    mutationFn: (next: DashboardItem[]) => saveDashboardLayout(next),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard-layout"] }); toast.success("Dashboard guardado"); },
    onError: () => toast.error("No se pudo guardar el dashboard"),
  });
  const resetMut = useMutation({
    mutationFn: resetDashboardLayout,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard-layout"] }); setItems(DEFAULT_LAYOUT); toast.success("Dashboard restablecido"); },
    onError: () => toast.error("No se pudo restablecer"),
  });

  const ctx: WidgetContext = useMemo(() => ({
    recordType: tipo as "SALES_ORDER" | "INVOICE",
    year: data.year,
    records: data.records,
    prevRecords: data.prevRecords,
    catMap: data.catMap,
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

  if (!items || data.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const startEdit = () => { setBackup(items); setEditing(true); };
  const cancelEdit = () => { if (backup) setItems(backup); setEditing(false); };
  const save = () => { saveMut.mutate(items); setEditing(false); };

  const addWidget = (id: string) => {
    const def = WIDGET_MAP.get(id);
    if (!def || items.some((i) => i.id === id)) return;
    const maxY = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
    setItems([...items, { id, x: 0, y: maxY, w: def.defaultSize.w, h: def.defaultSize.h }]);
  };
  const removeWidget = (id: string) => setItems(items.filter((i) => i.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <WidgetPicker presentIds={new Set(items.map((i) => i.id))} onAdd={addWidget} />
            <Button variant="outline" size="sm" onClick={() => resetMut.mutate()}>
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

      <div ref={containerRef}>
        {mounted && (
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
            {items.map((it) => {
              const def = WIDGET_MAP.get(it.id);
              if (!def) return <div key={it.id} />;
              return (
                <div key={it.id}>
                  <WidgetFrame title={def.title} editing={editing} onRemove={() => removeWidget(it.id)}>
                    {def.render(ctx)}
                  </WidgetFrame>
                </div>
              );
            })}
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
}
