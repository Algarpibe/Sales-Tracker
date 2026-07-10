"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSavedViews, saveView, deleteSavedView } from "@/actions/saved-views-actions";
import { parseClientesState, type ClientesViewState } from "@/lib/clientes-view-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Bookmark, ChevronDown, Save, X } from "lucide-react";
import { toast } from "sonner";

const VIEW_KEY = "clientes";

export function SavedViewsMenu({ current, onApply }: { current: ClientesViewState; onApply: (s: ClientesViewState) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["saved-views", VIEW_KEY], queryFn: () => getSavedViews(VIEW_KEY) });
  const views = q.data ?? [];

  const saveMut = useMutation({
    mutationFn: (name: string) => saveView(VIEW_KEY, name, current),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saved-views", VIEW_KEY] }); toast.success("Vista guardada"); },
    onError: () => toast.error("No se pudo guardar la vista"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-views", VIEW_KEY] }),
    onError: () => toast.error("No se pudo borrar la vista"),
  });

  const onSave = () => {
    const name = window.prompt("Nombre de la vista");
    if (name && name.trim()) saveMut.mutate(name.trim());
  };
  const onLoad = (state: unknown) => {
    const s = parseClientesState(state);
    if (s) onApply(s);
    else toast.error("Vista no válida");
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onSave}>
        <Save className="mr-2 h-4 w-4" /> Guardar vista
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(props) => (
            <Button variant="outline" size="sm" {...props}>
              <Bookmark className="mr-2 h-4 w-4" /> Vistas <ChevronDown className="ml-1 h-4 w-4" />
            </Button>
          )}
        />
        <DropdownMenuContent align="end">
          {views.length === 0 ? (
            <DropdownMenuItem disabled>Sin vistas guardadas</DropdownMenuItem>
          ) : (
            views.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => onLoad(v.state)} className="flex items-center justify-between gap-4">
                <span>{v.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Borrar vista"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); delMut.mutate(v.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); delMut.mutate(v.id); } }}
                  className="text-muted-foreground hover:text-rose-500"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
