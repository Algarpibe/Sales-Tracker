"use client";

import { Download, ChevronDown } from "lucide-react";
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
  onXlsx: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <Button variant="outline" size="sm" disabled={disabled} {...props}>
            <Download className="mr-2 h-4 w-4" /> Exportar <ChevronDown className="ml-1 h-4 w-4" />
          </Button>
        )}
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onCopy}>Copiar tabla</DropdownMenuItem>
        <DropdownMenuItem onClick={onCsv}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={onXlsx}>Excel (.xlsx)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
