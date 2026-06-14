"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { getCategories } from "@/actions/category-actions";
import { bulkUpsertSalesRecords } from "@/actions/sales-actions";
import type { RecordType } from "@/types/database";
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
      // Mapa de categorías de la empresa (por nombre, case-insensitive)
      const cats = await getCategories();
      const catMap = new Map((cats || []).map((c) => [c.name.toLowerCase(), c.id]));

      // Separa filas válidas de las que tienen categoría desconocida (para avisar, no descartar en silencio)
      const records: {
        category_id: string;
        record_type: RecordType;
        amount_usd: number;
        record_month: number;
        record_year: number;
      }[] = [];
      const unknownCats = new Set<string>();
      for (const r of rows) {
        const id = catMap.get(r.category.toLowerCase());
        if (!id) {
          unknownCats.add(r.category);
          continue;
        }
        records.push({
          category_id: id,
          record_type: r.type as RecordType,
          amount_usd: r.amount,
          record_month: r.month,
          record_year: r.year,
        });
      }

      if (records.length === 0) {
        toast.error("No se importó ningún registro", {
          description: unknownCats.size
            ? `Categorías no encontradas: ${[...unknownCats].slice(0, 5).join(", ")}`
            : "No hay filas válidas en el archivo.",
        });
        setImporting(false);
        return;
      }

      const { imported, invalid } = await bulkUpsertSalesRecords(records);
      const skipped = rows.length - records.length; // categoría desconocida

      if (skipped > 0 || invalid > 0) {
        const partes: string[] = [`${imported} importados`];
        if (skipped > 0) {
          partes.push(
            `${skipped} omitidos por categoría no encontrada` +
              (unknownCats.size ? ` (${[...unknownCats].slice(0, 3).join(", ")}${unknownCats.size > 3 ? "…" : ""})` : "")
          );
        }
        if (invalid > 0) partes.push(`${invalid} inválidos (mes/año/monto fuera de rango)`);
        toast.warning(partes.join(" · "));
      } else {
        toast.success(`${imported} registros importados`);
      }
      setRows([]); setFile(null);
    } catch (err) {
      toast.error("Error al importar", { description: (err as Error).message });
    }
    setImporting(false);
  };

  if (profile?.role === "lector") {
    return (
      <Card className="border-red-100 bg-red-50/20 p-8 text-center">
        <CardHeader className="flex flex-col items-center gap-2">
          <Upload className="h-10 w-10 text-red-500 opacity-20" />
          <CardTitle className="text-xl text-red-700">Acceso Restringido</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600/80">Tu rol de **Lector** no permite realizar importaciones de datos. Contacta a un administrador si necesitas permisos de edición.</p>
        </CardContent>
      </Card>
    );
  }

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
                <TableRow key={`${r.category}-${r.type}-${r.year}-${r.month}-${i}`}>
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
