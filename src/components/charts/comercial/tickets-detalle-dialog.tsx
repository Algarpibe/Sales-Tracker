"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MONTHS, formatPct } from "@/lib/constants";
import {
  HORA_FIN,
  HORA_INICIO,
  formatoInstanteBogota,
  textoPlazo,
  type DetalleTicketsMes,
  type EstadoPlazo,
  type FilaDetalleTicket,
} from "@/lib/kpi-tickets";

const ETIQUETA_ESTADO: Record<EstadoPlazo, string> = {
  en_plazo: "En plazo",
  fuera_de_plazo: "Fuera de plazo",
  excluido: "Excluido (rechazo)",
  abierto_sin_vencer: "Abierto, sin vencer",
};

// Solo llevan color los dos estados que deciden el porcentaje: los que no cuentan ya
// van atenuados en su propio apartado.
const COLOR_ESTADO: Record<EstadoPlazo, string> = {
  en_plazo: "text-emerald-500",
  fuera_de_plazo: "text-red-500",
  excluido: "",
  abierto_sin_vencer: "",
};

function textoSalida(f: FilaDetalleTicket): string {
  if (f.fin === null) return "abierto";
  return `${formatoInstanteBogota(f.fin)} → ${f.faseSalida ?? "—"}`;
}

function TablaEpisodios({ filas, etiqueta }: { filas: FilaDetalleTicket[]; etiqueta: string }) {
  return (
    <table aria-label={etiqueta} className="w-full text-xs">
      <thead>
        <tr className="border-b border-border/40 text-left text-muted-foreground">
          <th className="py-1 pr-2 font-medium">Ticket</th>
          <th className="py-1 pr-2 font-medium">Cliente</th>
          <th className="py-1 pr-2 font-medium">Entrada</th>
          <th className="py-1 pr-2 font-medium">Salida</th>
          <th className="py-1 pr-2 text-right font-medium">Horas</th>
          <th className="py-1 font-medium">Estado</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          // Un ticket no puede abrir dos episodios en el mismo instante (una entrada con
          // uno abierto no reinicia el reloj), así que ticket + entrada es única.
          <tr key={`${f.ticketId}-${f.inicio}`} className="border-b border-border/20 align-top">
            <td className="py-1 pr-2 tabular-nums">{f.numero === null ? "—" : `#${f.numero}`}</td>
            <td className="max-w-[180px] truncate py-1 pr-2">{f.cliente ?? "—"}</td>
            <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{formatoInstanteBogota(f.inicio)}</td>
            <td className="py-1 pr-2">{textoSalida(f)}</td>
            {/* Un excluido no se mide: «0.0» se leería como «resuelto al instante». */}
            <td className="py-1 pr-2 text-right tabular-nums">
              {f.estado === "excluido" ? "—" : f.horas.toFixed(1)}
            </td>
            <td className={`whitespace-nowrap py-1 ${COLOR_ESTADO[f.estado]}`}>{ETIQUETA_ESTADO[f.estado]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Detalle de una celda de «Tickets de Servicio Técnico en plazo». Presentacional: recibe
 * el detalle ya calculado por la tabla con la misma clasificación y el mismo `ahora` que
 * la celda, así que el pie no puede enseñar otro porcentaje. No llama al servidor.
 */
export function TicketsDetalleDialog({
  abierto,
  onCerrar,
  anio,
  mes,
  detalle,
  plazoHoras,
}: {
  abierto: boolean;
  onCerrar: () => void;
  anio: number;
  /** 1-12. */
  mes: number;
  detalle: DetalleTicketsMes | null;
  /** Plazo con el que la tabla clasificó los episodios: se enseña para que el detalle se explique solo. */
  plazoHoras: number;
}) {
  // Misma fórmula que ticketsEnPlazoPorMes, para que el redondeo de formatPct coincida.
  const pct = detalle && detalle.total > 0 ? formatPct((detalle.enPlazo / detalle.total) * 100) : "—";
  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open) onCerrar(); }}>
      <DialogContent className="max-h-[80vh] overflow-auto sm:max-w-3xl">
        {detalle && (
          <>
            <DialogHeader>
              <DialogTitle>
                Tickets en plazo · {MONTHS[mes - 1].full} {anio}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                De compañía · en plazo: menos de {textoPlazo(plazoHoras)} h laborables · horas laborables de lunes a viernes, de {HORA_INICIO}:00 a {HORA_FIN}:00 en Bogotá, sin festivos.
              </p>
            </DialogHeader>
            {detalle.cuentan.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Ningún episodio cuenta todavía este mes.</p>
            ) : (
              <TablaEpisodios filas={detalle.cuentan} etiqueta="Cuentan para el porcentaje" />
            )}
            {detalle.noCuentan.length > 0 && (
              <section aria-label="No cuentan para el porcentaje" className="space-y-1 opacity-60">
                <h3 className="text-xs font-medium text-muted-foreground">No cuentan para el porcentaje</h3>
                <TablaEpisodios filas={detalle.noCuentan} etiqueta="No cuentan" />
              </section>
            )}
            <p className="border-t border-border/40 pt-2 font-semibold tabular-nums">
              {`${detalle.enPlazo} en plazo de ${detalle.total} → ${pct}`}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
