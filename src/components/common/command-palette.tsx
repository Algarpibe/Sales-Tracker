"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getCustomerSales } from "@/actions/customer-sales-actions";
import { getItemSales } from "@/actions/item-sales-actions";
import { dedupeCustomers, articleHref } from "@/lib/global-search";
import { customerHref } from "@/lib/customer-detail";
import { useAuth } from "@/components/providers/auth-provider";
import {
  Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Home, BarChart3, Package, Users, ClipboardList, ListTree, TrendingUp, FolderOpen, Settings } from "lucide-react";

const FIRST_YEAR = 2021;

const PAGES = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/tablas", label: "Tablas", icon: BarChart3 },
  { href: "/articulos", label: "Artículos", icon: Package },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/cliente-articulo", label: "Cliente × Artículo", icon: ClipboardList },
  { href: "/cliente-categoria", label: "Cliente × Categoría", icon: ListTree },
  { href: "/analytics", label: "Análisis", icon: TrendingUp },
  { href: "/categories", label: "Categorías", icon: FolderOpen },
  { href: "/settings", label: "Configuración", icon: Settings },
];

const CommandContext = createContext<{ setOpen: (o: boolean) => void }>({ setOpen: () => {} });
export function useCommand() { return useContext(CommandContext); }

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const customersQ = useQuery({
    queryKey: ["search-customers"],
    queryFn: () => getCustomerSales({ tipo: "INVOICE", desdeAnio: FIRST_YEAR, hastaAnio: thisYear }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const itemsQ = useQuery({
    queryKey: ["search-items"],
    queryFn: () => getItemSales({ tipo: "INVOICE", desde: `${FIRST_YEAR}-01-01`, hasta: `${thisYear}-12-31` }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const customers = useMemo(() => dedupeCustomers(customersQ.data ?? []), [customersQ.data]);
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const pages = useMemo(
    () => (isAdmin ? [...PAGES, { href: "/admin/users", label: "Usuarios", icon: Users }] : PAGES),
    [isAdmin]
  );

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandContext.Provider value={{ setOpen }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen} title="Buscar" description="Clientes, artículos y páginas">
        <Command>
        <CommandInput placeholder="Buscar clientes, artículos, páginas…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Ir a…">
            {pages.map((p) => (
              <CommandItem key={p.href} onSelect={() => go(p.href)}>
                <p.icon className="mr-2 h-4 w-4" /> {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {customers.length > 0 && (
            <CommandGroup heading="Clientes">
              {customers.map((c) => (
                <CommandItem key={`c-${c}`} onSelect={() => go(customerHref(c))}>
                  <Users className="mr-2 h-4 w-4" /> {c}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {items.length > 0 && (
            <CommandGroup heading="Artículos">
              {items.map((it) => (
                <CommandItem key={`i-${it.item_id}`} onSelect={() => go(articleHref(it))}>
                  <Package className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{it.nombre}</span>
                  {it.sku && <span className="ml-2 text-xs text-muted-foreground">{it.sku}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </CommandContext.Provider>
  );
}
