"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Home,
  TrendingUp,
  FileUp,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";

const navItems = [
  { href: "/home", label: "Inicio", icon: Home },
  { href: "/tablas", label: "Tablas", icon: BarChart3 },
  { href: "/analytics", label: "Análisis", icon: TrendingUp },
  { href: "/analytics?tab=forecast", label: "Forecasting", icon: Sparkles },
  { href: "/import", label: "Importar", icon: FileUp },
  { href: "/categories", label: "Categorías", icon: FolderOpen },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const allItems = [...navItems];
  if (isAdmin) {
    allItems.push({ href: "/admin/users", label: "Usuarios", icon: Users });
  }

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <BarChart3 className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="text-lg font-bold text-sidebar-foreground">
            SalesTracker
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {allItems.map((item) => {
          let isActive = false;
          
          if (item.href.includes("?tab=forecast")) {
            isActive = pathname === "/analytics" && searchParams.get("tab") === "forecast";
          } else if (item.href === "/analytics") {
            isActive = pathname === "/analytics" && !searchParams.get("tab");
          } else {
            isActive = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href + "/"));
          }

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
              <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70")} />
              {!collapsed && <span>{item.label}</span>}
              {isActive && !collapsed && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-full justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="flex items-center gap-2">
              <ChevronLeft className="h-4 w-4" />
              <span className="text-xs">Contraer menú</span>
            </div>
          )}
        </Button>
      </div>
    </aside>
  );
}
