"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, User, Mail, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLES } from "@/lib/constants";

const profileSchema = z.object({
  full_name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileForm() {
  const { profile, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();
  const roleInfo = ROLES.find((r) => r.value === profile?.role);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      full_name: profile?.full_name || "",
      email: profile?.email || "",
    },
  });

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user) return;
    setIsLoading(true);

    try {
      // 1. Update Profile in public.profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: values.full_name,
          email: values.email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // 2. Update Email in Auth if changed
      if (values.email !== profile?.email) {
        const { error: authError } = await supabase.auth.updateUser({
          email: values.email,
        });
        if (authError) throw authError;
        toast.info("Se ha enviado un correo de confirmación a tu nueva dirección.");
      }

      toast.success("Perfil actualizado correctamente");
      reset(values);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error(error.message || "Error al actualizar el perfil");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden border-none bg-card/50 backdrop-blur-xl shadow-2xl ring-1 ring-white/10">
      <CardHeader className="border-b border-white/5 bg-white/5 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <User className="h-5 w-5 text-primary" /> Perfil
            </CardTitle>
            <CardDescription>
              Gestiona tu información personal y cuenta
            </CardDescription>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
            <Shield className="mr-1 h-3.5 w-3.5" />
            {roleInfo?.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-sm font-medium text-muted-foreground">
                Nombre Completo
              </Label>
              <div className="relative">
                <Input
                  id="full_name"
                  {...register("full_name")}
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all"
                  placeholder="Tu nombre"
                />
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
              {errors.full_name && (
                <p className="text-xs font-medium text-destructive">{errors.full_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                Correo Electrónico
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  {...register("email")}
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all"
                  placeholder="tu@email.com"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
              {errors.email && (
                <p className="text-xs font-medium text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <p className="text-xs text-muted-foreground">
              ID de Empresa: <span className="font-mono text-primary/70">{profile?.company_id}</span>
            </p>
            <Button 
              type="submit" 
              disabled={isLoading || !isDirty}
              className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar Cambios
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
