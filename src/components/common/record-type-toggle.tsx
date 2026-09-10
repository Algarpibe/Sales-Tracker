"use client";

import { FileText, Receipt } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type RecordTypeValue = "SALES_ORDER" | "INVOICE";

const TRIGGER_BASE =
  "text-[10px] h-8 font-bold gap-2 uppercase tracking-wider transition-all";

/**
 * Conmutador Órdenes de Venta / Facturas. Única definición del control en toda
 * la app: antes había cuatro diseños distintos, y cuatro gráficos con el estado
 * activo roto por usar `data-[state=active]` (sintaxis de Radix) en un proyecto
 * que usa base-ui, que emite `data-active`.
 *
 * Se adapta a su contenedor, con anchos MEDIDOS en el navegador, no estimados:
 * - Etiquetas completas: 260px (2 × 125px de la píldora más ancha + 10px de
 *   padding y borde). Por eso el punto de corte es 260px: con 240px, entre 240 y
 *   259px las etiquetas completas desbordaban hasta 20px.
 * - Etiquetas cortas ("OV" / "FAC"): 125px. Es el ancho mínimo del contenedor.
 *
 * Es una consulta de CONTENEDOR, no de viewport: manda el ancho del widget o de
 * la fila donde vive el control, no el de la pantalla.
 */
export function RecordTypeToggle({
  value,
  onValueChange,
  className,
}: {
  value: RecordTypeValue;
  onValueChange: (v: RecordTypeValue) => void;
  className?: string;
}) {
  return (
    // Sin `shrink-0`: este conmutador es el que debe ceder espacio cuando la fila
    // se estrecha; con `shrink-0` aplastaba a sus vecinos (el selector de
    // resolución del Histórico). Pero `container-type: inline-size` anula el
    // ancho mínimo por contenido, así que sin `min-w` se hundía hasta quedar
    // ilegible. `min-w-[125px]` es el ancho medido de las etiquetas cortas.
    <div className={cn("@container w-full max-w-[260px] min-w-[125px]", className)}>
      <Tabs
        value={value}
        onValueChange={(v) => { if (v) onValueChange(v as RecordTypeValue); }}
        className="w-full"
      >
        {/* flex y no grid: `grid-cols-2` equivale a `minmax(0, 1fr)` y deja que
            las píldoras se encojan por debajo de su propio texto. */}
        <TabsList className="flex w-full bg-card/50 backdrop-blur-sm border border-white/10 h-10 p-1">
          <TabsTrigger
            value="SALES_ORDER"
            className={cn(
              TRIGGER_BASE,
              "data-active:bg-primary data-active:text-primary-foreground",
              // El TabsTrigger compartido trae `dark:data-active:bg-input/30`, que con
              // dos variantes gana en especificidad y tailwind-merge no elimina por ser
              // otra clave. Sin esto, en modo oscuro la píldora activa sale gris.
              "dark:data-active:bg-primary dark:data-active:text-primary-foreground"
            )}
          >
            <FileText className="size-3.5 shrink-0" />
            <span className="@max-[260px]:hidden">ÓRDENES (OV)</span>
            <span className="hidden @max-[260px]:inline">OV</span>
          </TabsTrigger>
          <TabsTrigger
            value="INVOICE"
            className={cn(
              TRIGGER_BASE,
              "data-active:bg-emerald-500 data-active:text-white",
              "dark:data-active:bg-emerald-500 dark:data-active:text-white"
            )}
          >
            <Receipt className="size-3.5 shrink-0" />
            <span className="@max-[260px]:hidden">FACTURAS (FAC)</span>
            <span className="hidden @max-[260px]:inline">FAC</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
