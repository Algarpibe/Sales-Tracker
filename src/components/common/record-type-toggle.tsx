"use client";

import { FileText, Receipt } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type RecordTypeValue = "SALES_ORDER" | "INVOICE";

/**
 * Conmutador Órdenes de Venta / Facturas. Única definición del control en toda
 * la app: antes había cuatro diseños distintos y cuatro gráficos con el estado
 * activo roto por usar `data-[state=active]` (sintaxis de Radix) en un proyecto
 * que usa base-ui, que emite `data-active`.
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
    <Tabs
      value={value}
      onValueChange={(v) => { if (v) onValueChange(v as RecordTypeValue); }}
      className={cn("w-full sm:w-auto", className)}
    >
      <TabsList className="grid w-full grid-cols-2 bg-card/50 backdrop-blur-sm border border-white/10 h-10 p-1">
        <TabsTrigger
          value="SALES_ORDER"
          className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-active:bg-primary data-active:text-primary-foreground transition-all"
        >
          <FileText className="size-3.5" /> ÓRDENES (OV)
        </TabsTrigger>
        <TabsTrigger
          value="INVOICE"
          className="text-[10px] h-8 font-bold gap-2 uppercase tracking-wider data-active:bg-emerald-500 data-active:text-white transition-all"
        >
          <Receipt className="size-3.5" /> FACTURAS (FAC)
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
