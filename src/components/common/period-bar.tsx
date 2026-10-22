"use client";

import { RecordTypeToggle, type RecordTypeValue } from "@/components/common/record-type-toggle";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getYearRange } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Barra de periodo: conmutador de tipo de registro (OV/FAC) y selector de año.
 * Es un componente controlado: el padre es dueño del tipo y del año y recibe
 * los cambios por `onRecordTypeChange` y `onYearChange`.
 */
export function PeriodBar({
  recordType,
  onRecordTypeChange,
  year,
  onYearChange,
  className,
}: {
  recordType: RecordTypeValue;
  onRecordTypeChange: (v: RecordTypeValue) => void;
  year: number;
  onYearChange: (y: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3", className)}>
      <RecordTypeToggle value={recordType} onValueChange={onRecordTypeChange} />

      <div className="flex gap-2 items-center bg-card/30 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
        <Select value={String(year)} onValueChange={(v) => { if (v) onYearChange(Number(v)); }}>
          <SelectTrigger aria-label="Año" className="w-[125px] border-none bg-transparent shadow-none h-8 font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getYearRange().map((y) => <SelectItem key={y} value={String(y)}>Año {y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
