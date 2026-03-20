"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  AlertTriangle,
  Save,
  UserCog
} from "lucide-react";
import {
  approveUser,
  deactivateUser,
  deleteUser,
  updateUserRole
} from "@/actions/admin-actions";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UserActionsProps {
  userId: string;
  isApproved: boolean;
  isRejected: boolean;
  currentRole: string;
}

export function UserActions({ userId, isApproved, isRejected, currentRole }: UserActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState(currentRole);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // If the selected role is different from the saved role
  const isRoleChanged = role !== currentRole;

  const handleApprove = () => {
    startTransition(async () => {
      try {
        await approveUser(userId, role);
        toast.success("Usuario aprobado correctamente con rol " + role);
      } catch (error) {
        toast.error("Error al aprobar usuario");
      }
    });
  };

  const handleUpdateRole = () => {
    startTransition(async () => {
      try {
        await updateUserRole(userId, role);
        toast.success("Rol actualizado a " + role);
      } catch (error) {
        toast.error("Error al actualizar rol");
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      try {
        await deactivateUser(userId);
        toast.success("Usuario desactivado/rechazado");
      } catch (error) {
        toast.error("Error al realizar la acción");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteUser(userId);
        toast.success("Usuario eliminado definitivamente");
        setShowDeleteDialog(false);
      } catch (error) {
        toast.error("Error al eliminar usuario");
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-2 pr-2">
      {/* Selector de Rol y Botón de Guardado */}
      <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-md border border-border/50">
        <Select value={role} onValueChange={(val) => { if (val) setRole(val); }} disabled={isPending}>
          <SelectTrigger className={`w-[110px] h-7 text-[11px] border-none bg-transparent focus:ring-0 shadow-none`}>
            <UserCog className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="lector">Lector</SelectItem>
          </SelectContent>
        </Select>

        {isRoleChanged && isApproved && (
          <Button
            size="sm"
            variant="default"
            className="h-7 px-2 text-[10px] bg-primary hover:bg-primary/90"
            onClick={handleUpdateRole}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Guardar
          </Button>
        )}
      </div>

      <div className="flex gap-1 justify-end ml-2">
        {!isApproved ? (
          <>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 h-8 text-xs px-3 font-semibold"
              onClick={handleApprove}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Aprobar
            </Button>
            {!isRejected && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-500 border-red-200 hover:bg-red-50 h-8 text-xs px-3"
                onClick={handleReject}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                Rechazar
              </Button>
            )}
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-red-500 hover:bg-red-50 h-8 text-xs px-3"
            onClick={handleReject}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
            Desactivar
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground/50 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0"
          onClick={() => setShowDeleteDialog(true)}
          disabled={isPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="flex flex-col items-center text-center gap-2">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-xl">¿Eliminar usuario?</DialogTitle>
            <DialogDescription className="text-balance">
              Esta acción es irreversible. Se eliminará la cuenta de <strong>{userId}</strong> y todos sus datos permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar Definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
