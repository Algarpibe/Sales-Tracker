"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { MONTHS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileUp, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ParsedRow {
  category: string;
  type: string;
  month: number;
  year: number;
  amount: number;
}

export default function ImportPage() {
  const { profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const supabase = createClient();

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws);

      const parsed: ParsedRow[] = json.map((row) => ({
        category: String(row["categoria"] || row["category"] || ""),
        type: String(row["tipo"] || row["type"] || "SALES_ORDER").toUpperCase().includes("FAC") ? "INVOICE" : "SALES_ORDER",
        month: Number(row["mes"] || row["month"] || 1),
        year: Number(row["año"] || row["anio"] || row["year"] || new Date().getFullYear()),
        amount: Number(row["monto"] || row["amount"] || row["valor"] || 0),
      })).filter((r) => r.category && r.amount > 0);

      setRows(parsed);
      toast.success(`${parsed.length} registros encontrados`);
    };
    reader.readAsBinaryString(f);
  }, []);

  const handleImport = async () => {
    if (!rows.length || !profile) return;
    setImporting(true);

    try {
      // Get categories map
      const { data: cats } = await supabase.from("categories").select("id, name").eq("is_active", true);
      const catMap = new Map((cats || []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]));

      const records = rows.filter((r) => catMap.has(r.category.toLowerCase())).map((r) => ({
        company_id: profile.company_id,
        category_id: catMap.get(r.category.toLowerCase())!,
        record_type: r.type,
        amount_usd: r.amount,
        record_month: r.month,
        record_year: r.year,
        created_by: profile.id,
        updated_by: profile.id,
      }));

      const { error } = await supabase.from("sales_records").upsert(records, {
        onConflict: "company_id,category_id,record_type,record_month,record_year",
      });

      if (error) throw error;
      toast.success(`${records.length} registros importados`);
      setRows([]); setFile(null);
    } catch (err) {
      toast.error("Error", { description: (err as Error).message });
    }
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar Datos</h1>
        <p className="text-muted-foreground">Carga ventas desde archivos CSV o Excel</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Subir archivo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="max-w-sm" />
            {rows.length > 0 && (
              <Button onClick={handleImport} disabled={importing}>
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Importar {rows.length} registros
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Columnas esperadas: categoria, tipo (OV/FAC), mes, año, monto</p>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Mes</TableHead>
                <TableHead>Año</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 50).map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{r.type === "SALES_ORDER" ? "OV" : "FAC"}</TableCell>
                  <TableCell>{MONTHS[r.month - 1]?.label}</TableCell>
                  <TableCell>{r.year}</TableCell>
                  <TableCell className="text-right font-mono">${r.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length > 50 && <p className="p-3 text-center text-sm text-muted-foreground">...y {rows.length - 50} registros más</p>}
        </div>
      )}
    </div>
  );
}
