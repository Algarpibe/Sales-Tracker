"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RecordTypeSelect({
  value,
  onValueChange,
  className = "w-[200px]",
}: {
  value: "SALES_ORDER" | "INVOICE";
  onValueChange: (v: "SALES_ORDER" | "INVOICE") => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => { if (v) onValueChange(v as "SALES_ORDER" | "INVOICE"); }}>
      <SelectTrigger className={className}>
        <SelectValue>{value === "SALES_ORDER" ? "Órdenes de Venta (OV)" : "Facturas (FAC)"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="INVOICE">Facturas (FAC)</SelectItem>
        <SelectItem value="SALES_ORDER">Órdenes de Venta (OV)</SelectItem>
      </SelectContent>
    </Select>
  );
}
