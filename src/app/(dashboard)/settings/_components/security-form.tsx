"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, KeyRound, Eye, EyeOff, ShieldCheck, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Debes ingresar tu contraseña actual"),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

// Estilo compartido de los inputs (igual que el componente Input de la app).
const inputClass =
  "h-9 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 pl-9 pr-10 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus:border-primary/50 font-mono md:text-sm";

export function SecurityForm() {
  const [isLoading, setIsLoading] = useState(false);
  // Cada campo tiene su propio toggle de visibilidad.
  const [show, setShow] = useState({ current: false, next: false, confirm: false });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: PasswordFormValues) => {
    setIsLoading(true);

    try {
      const { error } = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.password,
        revokeOtherSessions: true,
      });

      if (error) throw new Error(error.message || "Error al actualizar la contraseña");

      toast.success("Contraseña actualizada correctamente");
      reset();
      setShow({ current: false, next: false, confirm: false });
    } catch (error: any) {
      console.error("Error updating password:", error);
      toast.error(error.message || "Error al actualizar la contraseña");
    } finally {
      setIsLoading(false);
    }
  };

  // Botón "ojo" reutilizable por campo.
  const EyeToggle = ({ visible, onToggle }: { visible: boolean; onToggle: () => void }) => (
    <button
      type="button"
      onClick={onToggle}
      onMouseDown={(e) => e.preventDefault()}
      aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-all z-20 cursor-pointer"
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <Card className="overflow-hidden border-none bg-card/50 backdrop-blur-xl shadow-2xl ring-1 ring-white/10">
      <CardHeader className="border-b border-white/5 bg-white/5 pb-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <KeyRound className="h-5 w-5 text-primary" /> Seguridad
          </CardTitle>
          <CardDescription>
            Actualiza tu contraseña para mantener tu cuenta segura
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="text-sm font-medium text-muted-foreground">
                Contraseña Actual
              </Label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={show.current ? "text" : "password"}
                  {...register("currentPassword")}
                  className={inputClass}
                  placeholder="Tu contraseña actual"
                />
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <EyeToggle visible={show.current} onToggle={() => setShow((s) => ({ ...s, current: !s.current }))} />
              </div>
              {errors.currentPassword && (
                <p className="text-xs font-medium text-destructive">{errors.currentPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">
                Nueva Contraseña
              </Label>
              <div className="relative">
                <input
                  id="password"
                  type={show.next ? "text" : "password"}
                  {...register("password")}
                  className={inputClass}
                  placeholder="Mínimo 10 caracteres"
                />
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <EyeToggle visible={show.next} onToggle={() => setShow((s) => ({ ...s, next: !s.next }))} />
              </div>
              {errors.password && (
                <p className="text-xs font-medium text-destructive">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-muted-foreground">
                Confirmar Contraseña
              </Label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={show.confirm ? "text" : "password"}
                  {...register("confirmPassword")}
                  className={inputClass}
                  placeholder="Repite la nueva contraseña"
                />
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <EyeToggle visible={show.confirm} onToggle={() => setShow((s) => ({ ...s, confirm: !s.confirm }))} />
              </div>
              {errors.confirmPassword && (
                <p className="text-xs font-medium text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Actualizar Contraseña
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
