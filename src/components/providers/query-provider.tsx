"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { retryUnlessRateLimited, throwOnlyWithoutData } from "@/lib/query-errors";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
            // Un reintento, salvo un 429 del límite por usuario (SEC-006).
            retry: retryUnlessRateLimited,
            // FE-056: el error de una lectura sube al error boundary MÁS CERCANO. Cada
            // tarjeta/widget tiene el suyo (CardErrorBoundary): si falla una, solo esa
            // muestra «Reintentar»; las lecturas que sostienen la página entera caen en
            // (dashboard)/error.tsx. Solo se lanza sin datos que mostrar: un refetch
            // fallido con datos previos deja la tarjeta con lo último bueno.
            throwOnError: throwOnlyWithoutData,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
