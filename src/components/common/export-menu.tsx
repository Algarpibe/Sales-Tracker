"use client";

import { useRef, useState } from "react";
import { Download, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ExportMenu({
  onCopy,
  onCsv,
  onXlsx,
  disabled,
}: {
  onCopy: () => void;
  onCsv: () => void;
  // El .xlsx se genera en el servidor: mientras dura, el botón queda deshabilitado
  // (con spinner) para evitar exportaciones duplicadas por doble clic.
  onXlsx: () => void | Promise<unknown>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  // El ref corta el segundo clic aunque el re-render con busy aún no haya llegado.
  const busyRef = useRef(false);

  const handleXlsx = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onXlsx();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      {/* disabled va en el Trigger: Base UI lo reenvía en `props` (disabled nativo) y,
          puesto solo en el Button, el spread de `props` lo pisaba con false. */}
      <DropdownMenuTrigger
        disabled={disabled || busy}
        render={(props) => (
          <Button variant="outline" size="sm" aria-busy={busy} {...props}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exportar <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        )}
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onCopy}>Copiar tabla</DropdownMenuItem>
        <DropdownMenuItem onClick={onCsv}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={handleXlsx}>Excel (.xlsx)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
