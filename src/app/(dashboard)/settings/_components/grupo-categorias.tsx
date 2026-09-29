"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { grupoDe, type Seleccion } from "@/lib/seleccion-grupos";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Lo que un grupo necesita saber de cada categoría. */
export interface CategoriaDeGrupo {
  id: string;
  name: string;
  is_active: boolean;
}

/**
 * Un grupo de una tarjeta de clasificación: el desplegable con buscador (solo para
 * quien edita) y las etiquetas de lo marcado. Lo comparten «Categorías de Servicio
 * Técnico» y «Macro-categorías».
 *
 * Las etiquetas salen de la selección y no de las categorías activas, para que una
 * inactiva ya clasificada se siga viendo. Si no se viera, desaparecería del grupo al
 * guardar sin que nadie lo hubiera decidido.
 *
 * `corto` es el nombre de cada grupo que se usa en la nota junto a una categoría que ya
 * está en otro grupo y al final del nombre accesible del botón de quitar.
 */
export function GrupoCategorias<G extends string>({
  bucket,
  titulo,
  corto,
  seleccion,
  activas,
  porId,
  editable,
  onToggle,
}: {
  bucket: G;
  titulo: string;
  corto: Record<G, string>;
  seleccion: Seleccion<G>;
  activas: CategoriaDeGrupo[];
  porId: Map<string, CategoriaDeGrupo>;
  editable: boolean;
  onToggle: (id: string) => void;
}) {
  const ids = seleccion[bucket];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{titulo}</p>

      {editable && (
        <Popover>
          <PopoverTrigger
            aria-label={`Elegir ${titulo}`}
            className="inline-flex items-center justify-between w-full px-3 py-2 text-sm bg-black/20 border border-white/10 hover:bg-black/40 transition-all shadow-sm rounded-xl text-foreground cursor-pointer h-10"
          >
            <span className="truncate flex-1 text-left">
              {ids.length === 0 ? "Seleccionar categorías..." : `${ids.length} seleccionadas`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 bg-background/95 backdrop-blur-xl border-white/10 rounded-xl" align="start">
            <Command>
              <CommandInput placeholder="Buscar..." />
              <CommandList>
                <CommandEmpty>No hay resultados.</CommandEmpty>
                <CommandGroup>
                  {activas.map((c) => {
                    const grupo = grupoDe(seleccion, c.id);
                    const marcada = grupo === bucket;
                    // En otro grupo: se ve, pero desactivada y con la nota de dónde está.
                    const enOtro = grupo !== null && grupo !== bucket;
                    return (
                      <CommandItem
                        key={c.id}
                        value={c.name}
                        disabled={enOtro}
                        onSelect={() => onToggle(c.id)}
                      >
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border transition-all",
                            marcada
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-white/20 opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                        <span className="flex-1">{c.name}</span>
                        {enOtro && grupo && (
                          <span className="text-[11px] text-muted-foreground">en {corto[grupo]}</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <ul aria-label={titulo} className="flex flex-wrap gap-2">
        {ids.length === 0 && <li className="text-xs text-muted-foreground">Ninguna categoría.</li>}
        {ids.map((id) => {
          const c = porId.get(id);
          if (!c) return null;
          return (
            <li key={id}>
              <Badge variant="secondary" className="gap-1">
                {c.name}
                {!c.is_active && " (inactiva)"}
                {editable && (
                  <button
                    type="button"
                    aria-label={`Quitar ${c.name} de ${corto[bucket]}`}
                    onClick={() => onToggle(id)}
                    className="rounded-full hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
