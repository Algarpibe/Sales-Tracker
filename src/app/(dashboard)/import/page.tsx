import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, BarChart3 } from "lucide-react";

// La importación manual quedó deshabilitada: las ventas se sincronizan
// automáticamente desde Zoho (zoho-hub). Esta página es solo informativa.
export default function ImportPage() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="border-none bg-card/50 backdrop-blur-xl shadow-2xl ring-1 ring-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <RefreshCw className="h-5 w-5 text-primary" /> Sincronización automática
          </CardTitle>
          <CardDescription>
            La importación manual ya no es necesaria.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Las ventas (órdenes y facturas) se sincronizan automáticamente desde
            Zoho. Los datos que ves en la app son de solo lectura y siempre
            reflejan la información más reciente de Zoho.
          </p>
          <Link href="/tablas">
            <Button>
              <BarChart3 className="mr-2 h-4 w-4" /> Ir a Tablas
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
