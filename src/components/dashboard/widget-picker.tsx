"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { WIDGETS, type WidgetSection } from "@/lib/widget-registry";

const SECTIONS: WidgetSection[] = ["KPIs", "Dashboard", "Comercial", "Margen"];

export function WidgetPicker({
  presentIds, onAdd,
}: {
  presentIds: Set<string>;
  onAdd: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const available = WIDGETS.filter((w) => !presentIds.has(w.id));

  // Añadir cierra el diálogo: la tarjeta nueva se ve inmediatamente en la rejilla.
  const add = (id: string) => {
    onAdd(id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={(props) => (
          <Button variant="outline" size="sm" {...props}>
            <Plus className="mr-2 h-4 w-4" /> Añadir tarjeta
          </Button>
        )}
      />
      <DialogContent className="max-h-[70vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Añadir tarjeta</DialogTitle>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Ya has añadido todas las tarjetas.</p>
        ) : (
          <div className="space-y-4">
            {SECTIONS.map((s) => {
              const items = available.filter((w) => w.section === s);
              if (items.length === 0) return null;
              return (
                <div key={s} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s}</p>
                  <div className="grid gap-1">
                    {items.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => add(w.id)}
                        className="rounded-md border border-border/50 px-3 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        {w.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
