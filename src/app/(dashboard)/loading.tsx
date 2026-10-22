import { Skeleton } from "@/components/ui/skeleton";

// Estado de carga del área privada mientras el servidor prepara la página. El layout
// (sidebar y cabecera) se mantiene; solo el contenido muestra el esqueleto.
export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Cargando">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
      <Skeleton className="h-[400px] w-full rounded-xl" />
    </div>
  );
}
