"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RecordTypeToggle } from "@/components/common/record-type-toggle";
import { usePeriod } from "@/components/providers/period-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerKpiRow } from "@/components/customers/customer-kpi-row";
import { CustomerEvolutionCard } from "@/components/customers/customer-evolution-card";
import { CustomerBucketMixCard } from "@/components/customers/customer-bucket-mix-card";
import { CustomerTopItemsCard } from "@/components/customers/customer-top-items-card";
import { CustomerMarginCard } from "@/components/customers/customer-margin-card";
import { CustomerSeasonCard } from "@/components/customers/customer-season-card";

const FIRST_YEAR = 2021;

export default function ClienteDetallePage() {
  const params = useParams<{ customer: string }>();
  const customer = decodeURIComponent(params.customer);
  const thisYear = new Date().getFullYear();
  const allYears = useMemo(() => {
    const a: number[] = [];
    for (let y = FIRST_YEAR; y <= thisYear; y++) a.push(y);
    return a;
  }, [thisYear]);

  const { tipo, setTipo, year: anio, setYear: setAnio } = usePeriod();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary w-fit">
          <ArrowLeft className="h-4 w-4" /> Volver a Clientes
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight break-words">{customer}</h1>
          <div className="flex flex-wrap items-end gap-3">
            <RecordTypeToggle value={tipo} onValueChange={setTipo} />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Año</label>
              <Select value={String(anio)} onValueChange={(v) => { if (v) setAnio(Number(v)); }}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allYears.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <CustomerKpiRow customer={customer} recordType={tipo} year={anio} />
      <CustomerEvolutionCard customer={customer} recordType={tipo} year={anio} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CustomerBucketMixCard customer={customer} recordType={tipo} year={anio} />
        <CustomerTopItemsCard customer={customer} recordType={tipo} year={anio} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <CustomerMarginCard customer={customer} recordType={tipo} year={anio} />
        <CustomerSeasonCard customer={customer} recordType={tipo} year={anio} />
      </div>
    </div>
  );
}
