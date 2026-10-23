"use client";

import { Component, type ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logError } from "@/lib/logger";
import { READ_ERROR_MESSAGE, readErrorMessage } from "@/lib/query-errors";

/**
 * Error local de una tarjeta/widget (FE-056). Si una lectura falla (react-query lanza
 * al boundary más cercano, ver throwOnlyWithoutData en query-provider) o el gráfico
 * revienta al renderizar, solo ESA tarjeta muestra el aviso con «Reintentar»; el resto
 * de la página sigue. El detalle del error va al logger, nunca a la pantalla.
 * Reintentar reinicia las consultas fallidas (QueryErrorResetBoundary) y vuelve a
 * montar la tarjeta, que las pide de nuevo. Si cambian `resetKeys` (p. ej. año o tipo)
 * también se reintenta sola.
 */
export function CardErrorBoundary({
  children,
  title,
  resetKeys,
  className,
}: {
  children: ReactNode;
  /** Título de la tarjeta, para que el aviso diga qué no cargó. */
  title?: string;
  resetKeys?: readonly unknown[];
  className?: string;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <Boundary onReset={reset} title={title} resetKeys={resetKeys} className={className}>
          {children}
        </Boundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export function CardErrorFallback({
  title,
  message = READ_ERROR_MESSAGE,
  onRetry,
  className,
}: {
  title?: string;
  /** Texto seguro del aviso (readErrorMessage): nunca el detalle del error. */
  message?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="card-error"
      className={cn(
        "flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-card/30 p-6 text-center shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      {title && <p className="text-sm font-semibold">{title}</p>}
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="mr-2 h-4 w-4" /> Reintentar
      </Button>
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  onReset: () => void;
  title?: string;
  resetKeys?: readonly unknown[];
  className?: string;
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
}

// Los error boundaries siguen exigiendo un componente de clase en React 19.
class Boundary extends Component<BoundaryProps, { failed: boolean; message: string }> {
  state = { failed: false, message: READ_ERROR_MESSAGE };

  // El texto del aviso sale de readErrorMessage: genérico, salvo el límite por
  // usuario (SEC-006), que explica que basta con esperar y reintentar.
  static getDerivedStateFromError(error: unknown): { failed: boolean; message: string } {
    return { failed: true, message: readErrorMessage(error) };
  }

  componentDidCatch(error: unknown) {
    logError("tarjeta: error al cargar o renderizar", error, { card: this.props.title });
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && keysChanged(prev.resetKeys, this.props.resetKeys)) this.retry();
  }

  retry = () => {
    this.props.onReset();
    this.setState({ failed: false });
  };

  render() {
    if (this.state.failed) {
      return (
        <CardErrorFallback
          title={this.props.title}
          message={this.state.message}
          onRetry={this.retry}
          className={this.props.className}
        />
      );
    }
    return this.props.children;
  }
}
