import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, CheckCircle, XCircle, ShieldCheck, Clock } from "lucide-react";
import { UserActions } from "./_components/user-actions";
import { cn } from "@/lib/utils";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  // 1. Check if user is Alfonso or an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/home");
  }

  // 2. Fetch all users
  const { data: users, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching users:", error);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Usuarios</h1>
          <p className="text-muted-foreground">
            Aprueba o desactiva el acceso de los usuarios a la plataforma.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Users className="h-6 w-6 text-primary" />
        </div>
      </div>

      <Card className="border-border/50 shadow-xl overflow-hidden">
        <CardHeader className="bg-muted/30 pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Lista de Usuarios
          </CardTitle>
          <CardDescription>
            {users?.length || 0} usuarios registrados en total.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="font-semibold text-primary/80">Nombre</TableHead>
                <TableHead className="font-semibold text-primary/80">Email</TableHead>
                <TableHead className="font-semibold text-primary/80 text-center">Rol</TableHead>
                <TableHead className="font-semibold text-primary/80 text-center">Estado</TableHead>
                <TableHead className="font-semibold text-primary/80 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u) => (
                <TableRow key={u.id} className="border-border/50 hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">{u.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "Administrador" : u.role === "editor" ? "Editor" : "Lector"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium gap-1",
                        u.is_approved
                          ? "text-green-500 border-green-500/30 bg-green-500/10"
                          : u.is_rejected
                          ? "text-red-500 border-red-500/30 bg-red-500/10"
                          : "text-amber-500 border-amber-500/30 bg-amber-500/10"
                      )}
                    >
                      {u.is_approved ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : u.is_rejected ? (
                        <XCircle className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {u.is_approved
                        ? "Aprobado"
                        : u.is_rejected
                        ? "Rechazado"
                        : "Pendiente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {u.id !== user.id && (
                      <UserActions 
                        userId={u.id} 
                        isApproved={u.is_approved} 
                        isRejected={u.is_rejected} 
                        currentRole={u.role}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
