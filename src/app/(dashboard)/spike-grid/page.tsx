"use client";

// SPIKE TÉCNICO (temporal): valida react-grid-layout v2 con React 19 + Next 16.
// Objetivo: comprobar drag, resize, persistencia del layout en estado y que un
// gráfico recharts real se re-dibuja al redimensionar su celda.
// Esta ruta se elimina cuando el spike concluya.

import { useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { usePeriod } from "@/components/providers/period-provider";
import { TopItemsCard } from "@/components/charts/comercial/top-items-card";
import { ClientParetoCard } from "@/components/charts/comercial/client-pareto-card";

const INITIAL: Layout = [
  { i: "chart-top-items", x: 0, y: 0, w: 6, h: 10, minW: 3, minH: 6 },
  { i: "chart-pareto", x: 6, y: 0, w: 6, h: 10, minW: 3, minH: 6 },
  { i: "box-a", x: 0, y: 10, w: 4, h: 4 },
  { i: "box-b", x: 4, y: 10, w: 4, h: 4 },
];

export default function SpikeGridPage() {
  const { width, containerRef, mounted } = useContainerWidth();
  const [layout, setLayout] = useState<Layout>(INITIAL);
  const { tipo, year } = usePeriod();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Spike: grid configurable</h1>
        <p className="text-sm text-muted-foreground">
          Arrastra por la cabecera y redimensiona por la esquina inferior derecha. Ruta temporal de validación.
        </p>
      </div>

      <div ref={containerRef} className="rounded-lg border border-dashed border-border/60 p-2">
        {mounted && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{ cols: 12, rowHeight: 40, margin: [16, 16] }}
            dragConfig={{ handle: ".spike-drag-handle" }}
            onLayoutChange={(l) => setLayout(l as Layout)}
          >
            <div key="chart-top-items" className="overflow-hidden rounded-xl border border-border/40 bg-card/40">
              <div className="spike-drag-handle cursor-move bg-muted/40 px-3 py-1 text-xs font-medium">
                ⠿ Top 15 artículos (widget real)
              </div>
              <div className="h-[calc(100%-28px)] overflow-auto">
                <TopItemsCard recordType={tipo as "SALES_ORDER" | "INVOICE"} year={year} />
              </div>
            </div>

            <div key="chart-pareto" className="overflow-hidden rounded-xl border border-border/40 bg-card/40">
              <div className="spike-drag-handle cursor-move bg-muted/40 px-3 py-1 text-xs font-medium">
                ⠿ Pareto de clientes (widget real)
              </div>
              <div className="h-[calc(100%-28px)] overflow-auto">
                <ClientParetoCard recordType={tipo as "SALES_ORDER" | "INVOICE"} year={year} />
              </div>
            </div>

            <div key="box-a" className="rounded-xl border border-border/40 bg-card/40">
              <div className="spike-drag-handle cursor-move bg-muted/40 px-3 py-1 text-xs font-medium">⠿ Caja A</div>
              <div className="p-3 text-sm text-muted-foreground">Bloque de prueba</div>
            </div>

            <div key="box-b" className="rounded-xl border border-border/40 bg-card/40">
              <div className="spike-drag-handle cursor-move bg-muted/40 px-3 py-1 text-xs font-medium">⠿ Caja B</div>
              <div className="p-3 text-sm text-muted-foreground">Bloque de prueba</div>
            </div>
          </ReactGridLayout>
        )}
      </div>

      <details className="rounded-lg border border-border/40 p-3">
        <summary className="cursor-pointer text-sm font-medium">Layout actual (se guardaría así en BD)</summary>
        <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(layout, null, 1)}</pre>
      </details>
    </div>
  );
}
