"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const handleSignOut = async () => {
    await authClient.signOut();
    // Navegación completa (no router.push): descarta la caché de react-query del usuario
    // anterior (DATA-049), igual que signOut de auth-provider.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa intencionada
    window.location.href = "/login";
  };

  return (
    <Button variant="outline" className="w-full h-11" onClick={handleSignOut}>
      <LogOut className="mr-2 h-4 w-4" />
      Cerrar Sesión
    </Button>
  );
}
