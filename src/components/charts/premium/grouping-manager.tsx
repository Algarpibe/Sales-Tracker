"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Settings2, Trash2, Edit2, Plus, Loader2, X, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  saveCategoryGrouping,
  getSavedCategoryGroupings,
  updateCategoryGrouping,
  deleteCategoryGrouping,
  reorderCategoryGroupings,
} from "@/actions/grouping-actions";
import type { CategoryGroup, Category } from "@/types/database";

interface GroupingManagerProps {
  categories: Category[];
  onGroupsChanged?: () => void;
}

export function GroupingManager({ categories, onGroupsChanged }: GroupingManagerProps) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [groupName, setGroupName] = useState("");
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState("#6366f1");
  const [catPopoverOpen, setCatPopoverOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);

  const PRESET_COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", 
    "#eab308", "#22c55e", "#10b981", "#06b6d4", "#3b82f6", 
    "#64748b", "#78716c"
  ];

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { groups: data } = await getSavedCategoryGroupings();
      setGroups(data);
    } catch (err) {
      toast.error("Error al cargar agrupaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadGroups();
  }, [open, loadGroups]);

  const resetForm = () => {
    setGroupName("");
    setSelectedCatIds([]);
    setSelectedColor("#6366f1");
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!groupName.trim() || selectedCatIds.length === 0) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateCategoryGrouping(editingId, groupName, selectedCatIds, selectedColor);
        toast.success("Agrupación actualizada");
      } else {
        await saveCategoryGrouping(groupName, selectedCatIds, selectedColor);
        toast.success("Agrupación creada");
      }
      resetForm();
      await loadGroups();
      onGroupsChanged?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (group: CategoryGroup) => {
    setEditingId(group.id);
    setGroupName(group.name);
    setSelectedCatIds((group.mappings || []).map((m) => m.category_id));
    setSelectedColor(group.color || "#6366f1");
  };

  const handleDelete = async (groupId: string) => {
    try {
      await deleteCategoryGrouping(groupId);
      toast.success("Agrupación eliminada");
      await loadGroups();
      onGroupsChanged?.();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const newGroups = [...groups];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newGroups.length) return;

    [newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]];
    setGroups(newGroups);

    try {
      await reorderCategoryGroupings(newGroups.map(g => g.id));
      onGroupsChanged?.();
    } catch (err) {
      toast.error("Error al reordenar");
      await loadGroups();
    }
  };

  const toggleCategory = (catId: string) => {
    setSelectedCatIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const getCatName = (catId: string) => categories.find((c) => c.id === catId)?.name || catId;
  const getCatColor = (catId: string) => categories.find((c) => c.id === catId)?.color || "#6366f1";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={(props) => (
          <Button variant="outline" size="sm" className="gap-2" {...props}>
            <Settings2 className="h-4 w-4" /> Configurar Agrupaciones
          </Button>
        )}
      />
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agrupaciones Personalizadas de Categorías</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Crea grupos de categorías para analizar ventas por segmentos personalizados.
          </p>
        </DialogHeader>

        {/* Form */}
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nombre del grupo</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ej. Equipos de Medición"
            />
          </div>

          <div className="space-y-2">
            <Label>Color de representación</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 transition-all",
                    selectedColor === color ? "border-foreground scale-110 shadow-lg" : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categorías</Label>
            <Popover open={catPopoverOpen} onOpenChange={setCatPopoverOpen}>
              <PopoverTrigger
                className="inline-flex items-center justify-between w-full px-3 py-2 text-sm bg-background border border-input hover:bg-accent transition-all rounded-lg cursor-pointer"
              >
                <span className="text-muted-foreground truncate flex-1 text-left">
                  {selectedCatIds.length === 0
                    ? "Seleccionar categorías..."
                    : `${selectedCatIds.length} seleccionadas`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar categoría..." />
                  <CommandList className="max-h-[200px]">
                    <CommandEmpty>No encontrada.</CommandEmpty>
                    <CommandGroup>
                      {categories.map((cat) => {
                        const selected = selectedCatIds.includes(cat.id);
                        return (
                          <CommandItem
                            key={cat.id}
                            value={cat.name}
                            onSelect={() => toggleCategory(cat.id)}
                            className="cursor-pointer"
                          >
                            <div
                              className={cn(
                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border transition-all",
                                selected
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-muted-foreground/30 opacity-50 [&_svg]:invisible"
                              )}
                            >
                              <Check className="h-3 w-3" />
                            </div>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span>{cat.name}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Selected badges */}
            {selectedCatIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedCatIds.map((catId) => (
                  <Badge
                    key={catId}
                    variant="secondary"
                    className="text-xs pr-1 py-0.5"
                  >
                    <div
                      className="w-2 h-2 rounded-full mr-1.5"
                      style={{ backgroundColor: getCatColor(catId) }}
                    />
                    {getCatName(catId)}
                    <button
                      onClick={() => toggleCategory(catId)}
                      className="ml-1.5 bg-muted hover:bg-destructive/80 hover:text-white rounded-full p-0.5 transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !groupName.trim() || selectedCatIds.length === 0}
            className="w-full"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : editingId ? (
              <Edit2 className="mr-2 h-4 w-4" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            {editingId ? "Actualizar Agrupación" : "Crear Agrupación"}
          </Button>

          {editingId && (
            <Button variant="ghost" size="sm" onClick={resetForm} className="w-full text-muted-foreground">
              Cancelar edición
            </Button>
          )}
        </div>

        {/* Existing Groups List */}
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Agrupaciones guardadas</h4>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay agrupaciones creadas.</p>
          ) : (
            <div className="space-y-2">
              {groups.map((group, idx) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: group.color || "#6366f1" }} 
                    />
                    <div>
                      <p className="font-medium text-sm truncate">{group.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(group.mappings || []).length} categorías
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <div className="flex flex-col gap-0.5 border-r border-white/5 pr-1 mr-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                        onClick={() => handleMove(idx, "up")}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-primary/10 hover:text-primary disabled:opacity-20"
                        onClick={() => handleMove(idx, "down")}
                        disabled={idx === groups.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEdit(group)}
                    >
                      <Edit2 className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDelete(group.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
