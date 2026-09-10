"use client";

import { FileText, Receipt } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type RecordTypeValue = "SALES_ORDER" | "INVOICE";

const TRIGGER_BASE =
  "text-[10px] h-8 font-bold gap-2 uppercase tracking-wider transition-all min-w-0";

/**
 * Conmutador Órdenes de Venta / Facturas. Única definición del control en toda
 * la app: antes había cuatro diseños distintos, y cuatro gráficos con el estado
 * activo roto por usar `data-[state=active]` (sintaxis de Radix) en un proyecto
 * que usa base-ui, que emite `data-active`.
 *
 * Se adapta a su contenedor. Medido: a ancho completo ocupa 260px, pero los
 * widgets del dashboard pueden encogerse hasta 3 de 12 columnas (~288px menos
 * paddings), donde no cabría. Por debajo de 15rem las etiquetas se acortan a
 * "OV" y "FAC" en vez de desbordar. Es una consulta de CONTENEDOR, no de
 * viewport: lo que manda es el ancho del widget, no el de la pantalla.
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
    <div className={cn("@container w-full max-w-[260px] shrink-0", className)}>
      <Tabs
        value={value}
        onValueChange={(v) => { if (v) onValueChange(v as RecordTypeValue); }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 bg-card/50 backdrop-blur-sm border border-white/10 h-10 p-1">
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
            <span className="@max-[15rem]:hidden">ÓRDENES (OV)</span>
            <span className="hidden @max-[15rem]:inline">OV</span>
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
            <span className="@max-[15rem]:hidden">FACTURAS (FAC)</span>
            <span className="hidden @max-[15rem]:inline">FAC</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
