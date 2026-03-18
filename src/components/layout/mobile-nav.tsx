"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Home,
  TrendingUp,
  CreditCard,
  FileUp,
  FolderOpen,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/tablas", label: "Tablas", icon: BarChart3 },
  { href: "/analytics", label: "Análisis", icon: TrendingUp },
  { href: "/import", label: "Importar", icon: FileUp },
  { href: "/categories", label: "Categorías", icon: FolderOpen },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <BarChart3 className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-sidebar-foreground">
          SalesTracker
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
