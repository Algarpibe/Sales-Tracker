"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/types/database";
import { createCategory, updateCategory, deleteCategory } from "@/actions/category-actions";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Loader2, Edit2 } from "lucide-react";
import { toast } from "sonner";

export default function CategoriesPage() {
  const { profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3B82F6");
  
  // Edit State
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("#3B82F6");

  const supabase = createClient();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    
    if (error) {
      toast.error("Error al cargar categorías");
    } else {
      setCategories((data as Category[]) || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createCategory({ name, description, color });
      toast.success("Categoría creada");
      setName(""); setDescription(""); setColor("#3B82F6"); setOpen(false);
      fetch();
    } catch (err) { toast.error((err as Error).message); }
    setSaving(false);
  };

  const handleEdit = (c: Category) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDescription(c.description || "");
    setEditColor(c.color || "#3B82F6");
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      await updateCategory(editingId, {
        name: editName,
        description: editDescription,
        color: editColor
      });
      toast.success("Categoría actualizada");
      setEditOpen(false);
      setEditingId(null);
      fetch();
    } catch (err) { toast.error((err as Error).message); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory(id);
      toast.success("Categoría desactivada");
      fetch();
    } catch (err) { toast.error((err as Error).message); }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-[400px] rounded-xl" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorías</h1>
          <p className="text-muted-foreground">Gestión de categorías de artículos</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={(props) => (
              <Button {...props}>
                <Plus className="mr-2 h-4 w-4" />Nueva
              </Button>
            )} />
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Nueva Categoría</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Electrónica" /></div>
                <div className="space-y-2"><Label>Descripción</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional..." /></div>
                <div className="space-y-2"><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 px-1 py-1" /></div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={saving || !name.trim()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Crear Categoría
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar Categoría</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Ej. Electrónica" /></div>
            <div className="space-y-2"><Label>Descripción</Label><Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Opcional..." /></div>
            <div className="space-y-2"><Label>Color</Label><Input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-10 w-20 px-1 py-1" /></div>
          </div>
          <DialogFooter>
            <Button onClick={handleUpdate} disabled={saving || !editName.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Sin categorías.</TableCell></TableRow>
            ) : (
              categories.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell><div className="h-4 w-4 rounded-full" style={{ backgroundColor: c.color }} /></TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.description || "—"}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(c)}>
                          <Edit2 className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
