"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUBSCRIPTION_CATEGORIES, SUBSCRIPTION_STATUSES, BILLING_CYCLES, formatUSD } from "@/lib/constants";
import type { Subscription, SubscriptionCategory, SubscriptionStatus, BillingCycle } from "@/types/database";
import { createSubscription, deleteSubscription, updateSubscription } from "@/actions/subscription-actions";
import { KPICard } from "@/components/cards/kpi-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, DollarSign, Wrench, Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState({
    tool_name: "",
    provider: "",
    category: "General" as SubscriptionCategory,
    monthly_cost_usd: 0,
    billing_cycle: "monthly" as BillingCycle,
    status: "active" as SubscriptionStatus,
    start_date: new Date().toISOString().split("T")[0],
    url: "",
  });

  const supabase = createClient();

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false });
    setSubs((data as Subscription[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const filtered = statusFilter === "all"
    ? subs
    : subs.filter((s) => s.status === statusFilter);

  const activeSubs = subs.filter((s) => s.status === "active");
  const totalMonthly = activeSubs.reduce((s, sub) => s + Number(sub.monthly_cost_usd), 0);
  const totalAnnual = totalMonthly * 12;

  const handleCreate = async () => {
    setSaving(true);
    try {
      await createSubscription(form);
      toast.success("Suscripción creada");
      setOpen(false);
      setForm({
        tool_name: "", provider: "", category: "General",
        monthly_cost_usd: 0, billing_cycle: "monthly",
        status: "active", start_date: new Date().toISOString().split("T")[0], url: "",
      });
      fetchSubs();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSubscription(id);
      toast.success("Eliminada");
      fetchSubs();
    } catch (err) { toast.error((err as Error).message); }
  };

  const getStatusBadge = (status: SubscriptionStatus) => {
    const s = SUBSCRIPTION_STATUSES.find((st) => st.value === status);
    return <Badge variant="outline" className={s?.color}>{s?.label || status}</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-[130px] rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suscripciones</h1>
          <p className="text-muted-foreground">Gestiona tus herramientas y gastos SaaS</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={(props) => (
            <Button {...props}>
              <Plus className="mr-2 h-4 w-4" />Nueva Suscripción
            </Button>
          )} />
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agregar Suscripción</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Herramienta</Label>
                <Input value={form.tool_name} onChange={(e) => setForm({...form, tool_name: e.target.value})} placeholder="Ej. Slack, Figma" />
              </div>
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Input value={form.provider} onChange={(e) => setForm({...form, provider: e.target.value})} placeholder="Ej. Salesforce" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({...form, category: v as SubscriptionCategory})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUBSCRIPTION_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Costo mensual (USD)</Label>
                  <Input type="number" min={0} step={0.01} value={form.monthly_cost_usd} onChange={(e) => setForm({...form, monthly_cost_usd: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ciclo</Label>
                  <Select value={form.billing_cycle} onValueChange={(v) => setForm({...form, billing_cycle: v as BillingCycle})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BILLING_CYCLES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fecha inicio</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({...form, start_date: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={form.url} onChange={(e) => setForm({...form, url: e.target.value})} placeholder="https://..." />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving || !form.tool_name}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KPICard title="Gasto Mensual" value={formatUSD(totalMonthly)} icon={DollarSign} />
        <KPICard title="Gasto Anual Estimado" value={formatUSD(totalAnnual)} icon={CreditCard} />
        <KPICard title="Herramientas Activas" value={String(activeSubs.length)} icon={Wrench} />
      </div>

      {/* Filter */}
      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "all")}>
        <SelectTrigger className="w-[140px]"><SelectValue placeholder="Estado" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {SUBSCRIPTION_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Herramienta</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Costo/mes</TableHead>
              <TableHead>Ciclo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Sin suscripciones.</TableCell></TableRow>
            ) : (
              filtered.map((sub) => (
                <TableRow key={sub.id} className="group">
                  <TableCell className="font-medium">
                    <div>
                      <p>{sub.tool_name}</p>
                      {sub.provider && <p className="text-xs text-muted-foreground">{sub.provider}</p>}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{sub.category}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{formatUSD(Number(sub.monthly_cost_usd))}</TableCell>
                  <TableCell>{BILLING_CYCLES.find(c => c.value === sub.billing_cycle)?.label}</TableCell>
                  <TableCell>{getStatusBadge(sub.status)}</TableCell>
                  <TableCell className="text-muted-foreground">{sub.start_date}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => handleDelete(sub.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
