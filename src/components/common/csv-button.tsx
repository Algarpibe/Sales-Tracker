"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CsvButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <Download className="mr-2 h-4 w-4" /> CSV
    </Button>
  );
}
