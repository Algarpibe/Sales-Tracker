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
import { Loader2, Save, Building2, Hash, Globe, Factory, User, Mail, Shield, Camera, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLES } from "@/lib/constants";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const accountSchema = z.object({
  // Profile
  full_name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  // Company
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  tax_id: z.string().optional(),
  country: z.string().optional(),
  industry: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export function AccountSettingsForm() {
  const { profile, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const roleInfo = ROLES.find((r) => r.value === profile?.role);

  const { data: company, isLoading: isLoadingCompany } = useQuery({
    queryKey: ["company", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", profile.company_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    values: {
      full_name: profile?.full_name || "",
      email: profile?.email || "",
      name: company?.name || "",
      tax_id: company?.tax_id || "",
      country: company?.country || "",
      industry: company?.industry || "",
    },
  });

  const onSubmit = async (values: AccountFormValues) => {
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

      // 3. Update Company info if Admin
      if (profile?.company_id && profile?.role === "admin") {
        const { error: companyError } = await supabase
          .from("companies")
          .update({
            name: values.name,
            tax_id: values.tax_id,
            country: values.country,
            industry: values.industry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile.company_id);

        if (companyError) throw companyError;
        queryClient.invalidateQueries({ queryKey: ["company", profile.company_id] });
      }

      toast.success("Información de cuenta actualizada");
      reset(values);
    } catch (error: any) {
      console.error("Error updating account settings:", error);
      toast.error(error.message || "Error al actualizar la cuenta");
    } finally {
      setIsLoading(false);
    }
  };

  const onAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file || !user) return;

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast.error("La imagen no debe superar los 2MB");
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error("El archivo debe ser una imagen");
        return;
      }

      setIsUploading(true);

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Math.random()}.${fileExt}`;

      // 1. Upload to Storage
      const { error: uploadError, data } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update Profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success("Foto de perfil actualizada correctamente");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast.error(error.message || "Error al subir la imagen. Asegúrate que el bucket 'avatars' exista.");
    } finally {
      setIsUploading(false);
    }
  };

  const initials = profile?.full_name
    ? profile.full_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "U";

  const isAdmin = profile?.role === "admin";

  if (isLoadingCompany) {
    return (
      <div className="space-y-8">
        <Card className="border-none bg-card/50 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 animate-pulse h-[350px]" />
        <Card className="border-none bg-card/50 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 animate-pulse h-[400px]" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Profile Card */}
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
          <div className="flex flex-col items-center mb-8 space-y-4">
            <div className="relative group">
              <Avatar className="h-32 w-32 border-4 border-primary/20 shadow-2xl transition-transform group-hover:scale-105">
                <AvatarImage src={profile?.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-primary/10 text-primary text-3xl font-black">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <label 
                htmlFor="avatar-upload" 
                className={`absolute bottom-0 right-0 p-2 rounded-full cursor-pointer shadow-lg transition-all
                  ${isUploading ? 'bg-muted pointer-events-none' : 'bg-primary hover:bg-primary/90 text-primary-foreground group-hover:scale-110'}`}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onAvatarUpload}
                  disabled={isUploading}
                />
              </label>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-primary italic uppercase tracking-widest">Foto de Perfil</p>
              <p className="text-xs text-muted-foreground">Recomendado: JPG o PNG, máx. 2MB</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-sm font-medium text-muted-foreground">
                Nombre Completo
              </Label>
              <div className="relative">
                <Input
                  id="full_name"
                  {...register("full_name")}
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all font-semibold"
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
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all font-semibold"
                  placeholder="tu@email.com"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
              {errors.email && (
                <p className="text-xs font-medium text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>
          <div className="pt-6 text-xs text-muted-foreground">
            ID de Empresa: <span className="font-mono text-primary/70">{profile?.company_id}</span>
          </div>
        </CardContent>
      </Card>

      {/* Company Card */}
      <Card className="overflow-hidden border-none bg-card/50 backdrop-blur-xl shadow-2xl ring-1 ring-white/10">
        <CardHeader className="border-b border-white/5 bg-white/5 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Building2 className="h-5 w-5 text-primary" /> Empresa
            </CardTitle>
            <CardDescription>
              Información corporativa de la organización
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="company_name" className="text-sm font-medium text-muted-foreground">
                Nombre de la Empresa
              </Label>
              <div className="relative">
                <Input
                  id="company_name"
                  {...register("name")}
                  disabled={!isAdmin}
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all font-semibold"
                  placeholder="Ej: Mi Empresa S.A."
                />
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
              {errors.name && (
                <p className="text-xs font-medium text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_id" className="text-sm font-medium text-muted-foreground">
                NIT / Identificación Fiscal
              </Label>
              <div className="relative">
                <Input
                  id="tax_id"
                  {...register("tax_id")}
                  disabled={!isAdmin}
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all font-medium"
                  placeholder="900.123.456-7"
                />
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry" className="text-sm font-medium text-muted-foreground">
                Industria / Sector
              </Label>
              <div className="relative">
                <Input
                  id="industry"
                  {...register("industry")}
                  disabled={!isAdmin}
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all font-medium"
                  placeholder="Ej: Tecnología, Salud..."
                />
                <Factory className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="country" className="text-sm font-medium text-muted-foreground">
                País
              </Label>
              <div className="relative">
                <Input
                  id="country"
                  {...register("country")}
                  disabled={!isAdmin}
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all font-medium"
                  placeholder="Colombia, España..."
                />
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/5 mt-6">
             <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-bold">
               {isAdmin ? "Tienes permisos de edición general" : "Solo lectura (Se requiere rango Administrador para editar Empresa)"}
             </div>
             
             <Button 
               type="submit" 
               disabled={isLoading || !isDirty}
               className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all"
             >
               {isLoading ? (
                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
               ) : (
                 <Save className="mr-2 h-4 w-4" />
               )}
               {isAdmin ? "Guardar Todos los Cambios" : "Guardar Perfil"}
             </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
