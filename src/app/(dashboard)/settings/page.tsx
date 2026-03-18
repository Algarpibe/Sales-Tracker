"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Hexagon, History } from "lucide-react";
import { AccountSettingsForm } from "./_components/account-settings-form";
import { SecurityForm } from "./_components/security-form";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  const { profile } = useAuth();

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-10">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-background p-8 border border-primary/10 shadow-inner">
        <div className="relative z-10">
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Configuración
          </h1>
          <p className="text-muted-foreground text-lg mt-2">
            Administra los detalles de tu cuenta, seguridad e información de empresa.
          </p>
        </div>
        <Hexagon className="absolute -right-10 -top-10 h-64 w-64 text-primary/5 rotate-12" />
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="space-y-8">
          <AccountSettingsForm />
        </div>

        <div className="space-y-8">
          <SecurityForm />
          
          <Card className="border-none bg-gradient-to-br from-card/30 to-card/10 backdrop-blur-xl shadow-xl ring-1 ring-white/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                  <History className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50">Miembro desde</p>
                  <p className="text-xl font-black text-primary/90">
                    {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "long",
                      year: "numeric"
                    }) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
