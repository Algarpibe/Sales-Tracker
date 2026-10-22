"use client";

import { useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Mismo mensaje para un alta nueva y para un email ya registrado: better-auth responde
// igual en los dos casos (autoSignIn desactivado, SEC-039) y la pantalla no debe
// delatar qué cuentas existen.
const REGISTRO_OK =
  "Cuenta creada. Un administrador debe aprobarla; podrás iniciar sesión cuando esté aprobada.";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    const { error } = await signUp.email({
      email,
      password,
      name: fullName,
    });

    if (error) {
      toast.error("Error al crear cuenta", {
        description: error.message,
      });
      setLoading(false);
      return;
    }

    // Sin sesión: el registro ya no inicia sesión. Se informa y se manda a /login.
    setRegistered(true);
    setLoading(false);
  };

  if (registered) {
    return (
      <Card className="border-border/50 shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Solicitud registrada</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-center text-muted-foreground leading-relaxed">
            {REGISTRO_OK}
          </p>
        </CardContent>
        <CardFooter>
          <Link href="/login" className={cn(buttonVariants(), "w-full")}>
            Ir a iniciar sesión
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-xl">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl font-bold">Crear Cuenta</CardTitle>
        <CardDescription>
          Regístrate para comenzar a analizar tus ventas
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleRegister}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Juan Pérez"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Repetir contraseña"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando cuenta...
              </>
            ) : (
              "Crear Cuenta"
            )}
          </Button>
          <p className="text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Iniciar sesión
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
