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
import { Loader2, Save, Building2, Hash, Globe, Factory } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const companySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  tax_id: z.string().optional(),
  country: z.string().optional(),
  industry: z.string().optional(),
});

type CompanyFormValues = z.infer<typeof companySchema>;

export function CompanyForm() {
  const { profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();
  const queryClient = useQueryClient();

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
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    values: {
      name: company?.name || "",
      tax_id: company?.tax_id || "",
      country: company?.country || "",
      industry: company?.industry || "",
    },
  });

  const onSubmit = async (values: CompanyFormValues) => {
    if (!profile?.company_id) return;
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from("companies")
        .update({
          name: values.name,
          tax_id: values.tax_id,
          country: values.country,
          industry: values.industry,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.company_id);

      if (error) throw error;

      toast.success("Información de la empresa actualizada");
      queryClient.invalidateQueries({ queryKey: ["company", profile.company_id] });
      reset(values);
    } catch (error: any) {
      console.error("Error updating company:", error);
      toast.error(error.message || "Error al actualizar la empresa");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingCompany) {
    return (
      <Card className="border-none bg-card/50 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 animate-pulse">
        <div className="h-[400px]" />
      </Card>
    );
  }

  const isAdmin = profile?.role === "admin";

  return (
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all"
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
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all"
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
                  className="pl-9 bg-white/5 border-white/10 focus:border-primary/50 transition-all"
                  placeholder="Colombia, España..."
                />
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
             <div className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-bold">
               {isAdmin ? "Tienes permisos de edición" : "Solo lectura (Admin requerido)"}
             </div>
            {isAdmin && (
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
                Actualizar Empresa
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
