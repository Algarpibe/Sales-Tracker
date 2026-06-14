import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock, XCircle, RefreshCw } from "lucide-react";
import { getSessionUser } from "@/lib/auth/guards";
import { SignOutButton } from "./_components/sign-out-button";

export default async function WaitingApprovalPage() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  const { profile } = sessionUser;

  if (profile?.is_approved) {
    redirect("/home");
  }

  const status: "pending" | "rejected" = profile?.is_rejected ? "rejected" : "pending";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background/50 p-4">
      <Card className="max-w-md border-border/50 shadow-2xl">
        <CardHeader className="space-y-4 text-center">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${
            status === "rejected" ? "bg-red-500/10" : "bg-amber-500/10"
          }`}>
            {status === "rejected" ? (
              <XCircle className="h-8 w-8 text-red-500" />
            ) : (
              <Clock className="h-8 w-8 text-amber-500 animate-pulse" />
            )}
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">
            {status === "rejected" ? "Registro Rechazado" : "Registro en Proceso"}
          </CardTitle>
          <CardDescription className="text-lg">
            {status === "rejected" ? "Tu solicitud ha sido denegada." : "Tu cuenta ha sido creada exitosamente."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {status === "rejected" ? (
            <p className="text-muted-foreground leading-relaxed">
              Lamentablemente, un administrador ha denegado tu acceso a <strong>SalesTracker Pro</strong>. Si crees que esto es un error, por favor contacta al equipo comercial.
            </p>
          ) : (
            <p className="text-muted-foreground leading-relaxed">
              Por motivos de seguridad, un administrador debe aprobar tu acceso a <strong>SalesTracker Pro</strong> antes de que puedas ver los paneles de análisis.
            </p>
          )}
          <div className="rounded-lg bg-muted/50 p-4 text-sm font-medium">
            <p className="text-secondary-foreground">
              {status === "rejected"
                ? "No podrás acceder a los datos de la plataforma en este momento."
                : "Hemos notificado a Alfonso García sobre tu solicitud. Recibirás acceso automáticamente una vez sea aprobada."}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 pt-6">
          <Button className="w-full h-11" render={(props) => (
            <a href="/waiting-approval" {...props}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Recargar Estado
            </a>
          )} />
          <SignOutButton />
          <p className="text-xs text-center text-muted-foreground mt-2">
            ¿Necesitas ayuda? Contacta a comercial@ambientalia.com.co
          </p>
        </CardFooter>
      </Card>

      {/* Visual background element */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(var(--primary-rgb),0.05)_0%,transparent_70%)] pointer-events-none" />
    </div>
  );
}
