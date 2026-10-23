"use client";

import { useEffect } from "react";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCw } from "lucide-react";
import { logError } from "@/lib/logger";

// Error boundary del área privada: captura errores de render y de las lecturas que
// sostienen la página entera (react-query con throwOnError). Los de una sola tarjeta
// los captura su CardErrorBoundary. Muestra una pantalla consistente con reintento.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Sin reiniciar el boundary de react-query, las consultas fallidas no se vuelven a
  // pedir al remontar y «Reintentar» volvería a mostrar este mismo error.
  const { reset: resetQueries } = useQueryErrorResetBoundary();

  useEffect(() => {
    logError("dashboard error boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Algo salió mal</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          No pudimos cargar esta sección. Puede ser un problema temporal de conexión.
          Inténtalo de nuevo.
        </p>
      </div>
      <Button
        onClick={() => {
          resetQueries();
          reset();
        }}
      >
        <RotateCw className="mr-2 h-4 w-4" /> Reintentar
      </Button>
    </div>
  );
}
