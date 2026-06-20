"use client";

import { useEffect } from "react";
import { logError } from "@/lib/logger";

// Fallback de último recurso: captura errores del layout raíz. Reemplaza todo el
// documento, por eso incluye <html>/<body> y estilos en línea mínimos.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("global error boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Algo salió mal</h2>
          <p style={{ color: "#a1a1aa", marginBottom: "1.5rem" }}>
            Ocurrió un error inesperado. Inténtalo de nuevo.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#6366f1",
              color: "white",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
